import { PermanentPlatformError } from './errors.js'
import type { ImportSink } from './contracts.js'
import type {
  CanonicalBracket,
  CanonicalEntrant,
  CanonicalEvent,
  CanonicalPhase,
  CanonicalTournament,
} from './canonical.js'

/**
 * Holds an adapter to the sink contract, then forwards to the real sink.
 *
 * Every import is wrapped in this, so a misbehaving adapter fails its import
 * with a specific message instead of writing rows that are quietly wrong. That
 * matters most for entrant references: an unknown id used to be stored as null,
 * which is indistinguishable from a bye, so rankings silently dropped the set.
 *
 * Checks are limited to violations that would corrupt data or crash a later
 * write. Merely unusual data is left alone — a completed set with no winner is
 * legal here, because rating already excludes undecided sets by design, and
 * failing the whole import over one odd bracket would be worse than importing
 * it.
 */
export class ValidatingSink implements ImportSink {
  private readonly platform: string
  private readonly delegate: ImportSink

  private tournamentSent = false
  private readonly eventIds = new Set<string>()
  private readonly phaseIds = new Set<string>()
  private readonly entrantsByEvent = new Map<string, Set<string>>()

  /** Entrants must arrive before their event's brackets, or sets cannot be checked. */
  private readonly eventsWithBrackets = new Set<string>()

  private failed = false

  constructor(platform: string, delegate: ImportSink) {
    this.platform = platform
    this.delegate = delegate
  }

  async tournament(tournament: CanonicalTournament): Promise<void> {
    this.begin('a tournament')
    this.check(!this.tournamentSent, 'more than one tournament')

    this.tournamentSent = true
    await this.forward(() => this.delegate.tournament(tournament))
  }

  /**
   * An import covers one event. A tournament's other events arrive through
   * their own imports, which is what lets a league take the singles bracket and
   * leave the doubles alone.
   */
  async event(event: CanonicalEvent): Promise<void> {
    this.begin('an event')
    this.check(this.tournamentSent, 'an event before the tournament')
    this.check(
      this.eventIds.size === 0,
      `a second event (${event.externalId}); an import covers one event`
    )

    this.eventIds.add(event.externalId)
    await this.forward(() => this.delegate.event(event))
  }

  async entrants(eventExternalId: string, entrants: CanonicalEntrant[]): Promise<void> {
    this.begin('entrants')
    this.check(this.tournamentSent, 'entrants before the tournament')
    this.check(this.eventIds.has(eventExternalId), `entrants before their event ${eventExternalId}`)
    this.check(
      !this.eventsWithBrackets.has(eventExternalId),
      `entrants for event ${eventExternalId} after that event's brackets, so its sets could not be checked`
    )

    const known = this.entrantsByEvent.get(eventExternalId) ?? new Set<string>()
    for (const entrant of entrants) {
      this.check(
        !known.has(entrant.externalId),
        `entrant ${entrant.externalId} twice in event ${eventExternalId}`
      )
      known.add(entrant.externalId)
    }
    this.entrantsByEvent.set(eventExternalId, known)

    await this.forward(() => this.delegate.entrants(eventExternalId, entrants))
  }

  async phase(eventExternalId: string, phase: CanonicalPhase): Promise<void> {
    this.begin('a phase')
    this.check(this.tournamentSent, 'a phase before the tournament')
    this.check(this.eventIds.has(eventExternalId), `a phase before its event ${eventExternalId}`)

    this.phaseIds.add(phase.externalId)
    await this.forward(() => this.delegate.phase(eventExternalId, phase))
  }

  async bracket(
    eventExternalId: string,
    phaseExternalId: string,
    bracket: CanonicalBracket
  ): Promise<void> {
    this.begin('a bracket')
    this.check(this.tournamentSent, 'a bracket before the tournament')
    this.check(this.eventIds.has(eventExternalId), `a bracket before its event ${eventExternalId}`)
    this.check(this.phaseIds.has(phaseExternalId), `a bracket before its phase ${phaseExternalId}`)

    this.checkSets(eventExternalId, bracket)
    this.eventsWithBrackets.add(eventExternalId)

    await this.forward(() => this.delegate.bracket(eventExternalId, phaseExternalId, bracket))
  }

  async progress(completed: number, total: number | null, label?: string): Promise<void> {
    this.begin('progress')
    await this.forward(() => this.delegate.progress(completed, total, label))
  }

  /**
   * Set ids are checked for duplicates within the bracket rather than across the
   * import, because the sets table is keyed by `(bracket, external_id)` and
   * platforms legitimately number sets per bracket.
   */
  private checkSets(eventExternalId: string, bracket: CanonicalBracket): void {
    const known = this.entrantsByEvent.get(eventExternalId) ?? new Set<string>()
    const seen = new Set<string>()

    for (const set of bracket.sets) {
      this.check(
        !seen.has(set.externalId),
        `set ${set.externalId} twice in bracket ${bracket.externalId}`
      )
      seen.add(set.externalId)

      const participants: string[] = []
      for (const id of [set.entrantAExternalId, set.entrantBExternalId]) {
        if (id === null) continue
        this.check(known.has(id), `set ${set.externalId} against unknown entrant ${id}`)
        participants.push(id)
      }

      if (set.winnerEntrantExternalId !== null) {
        this.check(
          participants.includes(set.winnerEntrantExternalId),
          `set ${set.externalId} with a winner that did not play in it`
        )
      }

      /**
       * An absent side cannot be disqualified. Usually means an adapter read the
       * platform's DQ marker off the wrong slot.
       */
      this.check(
        !set.entrantADisqualified || set.entrantAExternalId !== null,
        `set ${set.externalId} disqualifying side A, which has no entrant`
      )
      this.check(
        !set.entrantBDisqualified || set.entrantBExternalId !== null,
        `set ${set.externalId} disqualifying side B, which has no entrant`
      )

      for (const game of set.games) {
        if (game.winnerEntrantExternalId !== null) {
          this.check(
            participants.includes(game.winnerEntrantExternalId),
            `game ${game.number} of set ${set.externalId} with a winner that did not play in it`
          )
        }

        for (const selection of game.selections) {
          this.check(
            participants.includes(selection.entrantExternalId),
            `game ${game.number} of set ${set.externalId} with a selection for an entrant that did not play in it`
          )
        }
      }
    }
  }

  /**
   * A call arriving after something already threw means the adapter swallowed
   * the error, which is how an aborted import would otherwise keep fetching.
   */
  private begin(what: string): void {
    if (!this.failed) return

    throw new PermanentPlatformError(
      `${this.platform} sent ${what} after an earlier failure; an adapter must let sink errors propagate`,
      { platform: this.platform }
    )
  }

  private async forward(run: () => Promise<void>): Promise<void> {
    try {
      await run()
    } catch (error) {
      this.failed = true
      throw error
    }
  }

  private check(condition: boolean, violation: string): void {
    if (condition) return

    this.failed = true
    throw new PermanentPlatformError(`${this.platform} sent ${violation}`, {
      platform: this.platform,
    })
  }
}
