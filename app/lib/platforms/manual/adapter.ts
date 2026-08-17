import { CsvError, isTruthy, optionalNumber, parseCsv, requireColumns } from './csv.js'
import { PermanentPlatformError } from '#lib/platforms/errors'
import type { CanonicalEntrant, CanonicalSet, EntryKind, SetState } from '#lib/platforms/canonical'
import type {
  ImportSink,
  PlatformAdapter,
  PlatformContext,
  EventRef,
} from '#lib/platforms/contracts'

type ManualPayload = {
  name: string
  slug: string
  startAt?: string
  country?: string
  state?: string
  city?: string
  address?: string
  eventName?: string
  entryKind?: EntryKind
  /** CSV: name, seed, placement, dq */
  entrants: string
  /**
   * CSV: round, identifier, entrant_a, entrant_b, score_a, score_b, winner,
   * dq_a, dq_b
   */
  sets?: string
}

/**
 * Manual and offline-local imports from pasted CSV: no credentials, no HTTP, no
 * pagination, no stable participant ids, no character data.
 *
 * A CSV has no cross-tournament account concept, so participants carry no
 * external user id. Those accounts are flagged weak and can only ever be
 * matched by tag.
 */
export class ManualAdapter implements PlatformAdapter {
  readonly key = 'manual'
  readonly displayName = 'Manual / CSV'

  /** Nothing is fetched, but the contract requires a declared limit. */
  readonly rateLimit = { requests: 1000, perSeconds: 60 }

  /** No API, so nothing to authenticate against. */
  readonly credentials = null

  /** Not addressed by URL; selected by key with a payload instead. */
  matchUrl(): EventRef | null {
    return null
  }

  async fetchEvent(ref: EventRef, _context: PlatformContext, sink: ImportSink): Promise<void> {
    const payload = this.payload(ref)

    await sink.tournament({
      externalId: payload.slug,
      slug: payload.slug,
      name: payload.name,
      url: null,
      startAt: payload.startAt ? new Date(payload.startAt) : null,
      endAt: null,
      country: payload.country ?? null,
      state: payload.state ?? null,
      city: payload.city ?? null,
      address: payload.address ?? null,
      isOnline: false,
    })

    const eventExternalId = 'event'
    const entrants = this.entrants(payload)

    await sink.event({
      externalId: eventExternalId,
      name: payload.eventName ?? payload.name,
      game: null,
      entryKind: payload.entryKind ?? 'singles',
      teamSize: null,
      entrantCount: entrants.length,
    })

    await sink.entrants(eventExternalId, entrants)

    const phaseExternalId = 'bracket'
    await sink.phase(eventExternalId, { externalId: phaseExternalId, name: 'Bracket', order: 1 })

    await sink.bracket(eventExternalId, phaseExternalId, {
      externalId: 'bracket',
      name: 'Bracket',
      bracketType: 'other',
      sets: this.sets(payload, entrants),
    })

    await sink.progress(1, 1)
  }

  private payload(ref: EventRef): ManualPayload {
    const payload = ref.payload as ManualPayload | undefined

    if (!payload?.entrants) {
      throw new PermanentPlatformError('A manual import needs an entrants file', {
        platform: this.key,
      })
    }

    if (!payload.name || !payload.slug) {
      throw new PermanentPlatformError('A manual import needs a tournament name and URL slug', {
        platform: this.key,
      })
    }

    return payload
  }

  private entrants(payload: ManualPayload): CanonicalEntrant[] {
    const rows = this.parse(payload.entrants, 'entrants')
    requireColumns(rows, ['name'], 'entrants')

    const seen = new Set<string>()

    return rows.map((row, index) => {
      const name = row.name
      if (!name) {
        throw new PermanentPlatformError(`Row ${index + 2} of the entrants file has no name`, {
          platform: this.key,
        })
      }

      /**
       * The name is the only identifier a hand-made file has, so duplicates
       * would silently merge two competitors into one.
       */
      const externalId = name.toLowerCase()
      if (seen.has(externalId)) {
        throw new PermanentPlatformError(
          `The entrants file lists "${name}" more than once. Names must be unique.`,
          { platform: this.key }
        )
      }
      seen.add(externalId)

      return {
        externalId,
        name,
        seed: this.number(row.seed, `seed for ${name}`),
        placement: this.number(row.placement, `placement for ${name}`),
        isDisqualified: isTruthy(row.dq),
        participants: [
          {
            // No cross-tournament identity exists in a CSV.
            externalUserId: null,
            gamerTag: name,
            prefix: row.prefix || null,
            pronouns: row.pronouns || null,
          },
        ],
      }
    })
  }

  private sets(payload: ManualPayload, entrants: CanonicalEntrant[]): CanonicalSet[] {
    if (!payload.sets) return []

    const rows = this.parse(payload.sets, 'sets')
    requireColumns(rows, ['entrant_a', 'entrant_b'], 'sets')

    const known = new Set(entrants.map((entrant) => entrant.externalId))

    return rows.map((row, index) => {
      const line = index + 2
      const entrantA = this.entrantRef(row.entrant_a, known, line)
      const entrantB = this.entrantRef(row.entrant_b, known, line)

      const scoreA = this.number(row.score_a, `score on row ${line}`)
      const scoreB = this.number(row.score_b, `score on row ${line}`)

      /**
       * A hand-kept file has no score for a no-show, so the DQ columns are how a
       * walkover is recorded. Either side can be marked, so a double DQ works.
       */
      const dqA = isTruthy(row.dq_a)
      const dqB = isTruthy(row.dq_b)

      const winner = this.winner(
        row.winner,
        entrantA,
        entrantB,
        scoreA,
        scoreB,
        known,
        line,
        dqA,
        dqB
      )

      const state: SetState = winner === null ? 'pending' : 'completed'

      return {
        externalId: row.identifier || `set-${index + 1}`,
        state,
        round: this.number(row.round, `round on row ${line}`),
        identifier: row.identifier || null,
        fullRoundText: row.round_text || null,
        ordinal: index + 1,
        entrantAExternalId: entrantA,
        entrantBExternalId: entrantB,
        winnerEntrantExternalId: winner,
        scoreA,
        scoreB,
        entrantADisqualified: dqA,
        entrantBDisqualified: dqB,
        completedAt: null,
        games: [],
      }
    })
  }

  private entrantRef(value: string | undefined, known: Set<string>, line: number): string {
    const externalId = (value ?? '').toLowerCase()

    if (!externalId) {
      throw new PermanentPlatformError(`Row ${line} of the sets file is missing an entrant`, {
        platform: this.key,
      })
    }

    /**
     * Failing here rather than importing a set against an unknown competitor
     * matters: rankings would otherwise silently drop or misattribute it.
     */
    if (!known.has(externalId)) {
      throw new PermanentPlatformError(
        `Row ${line} of the sets file refers to "${value}", who is not in the entrants file`,
        { platform: this.key }
      )
    }

    return externalId
  }

  private winner(
    explicit: string | undefined,
    entrantA: string,
    entrantB: string,
    scoreA: number | null,
    scoreB: number | null,
    known: Set<string>,
    line: number,
    disqualifiedA: boolean,
    disqualifiedB: boolean
  ): string | null {
    if (explicit) {
      const winner = explicit.toLowerCase()
      if (!known.has(winner)) {
        throw new PermanentPlatformError(
          `Row ${line} of the sets file names an unknown winner "${explicit}"`,
          { platform: this.key }
        )
      }

      if (winner !== entrantA && winner !== entrantB) {
        throw new PermanentPlatformError(
          `Row ${line} of the sets file names a winner who did not play in that set`,
          { platform: this.key }
        )
      }

      return winner
    }

    /**
     * A single DQ decides the set on its own: the side that turned up advances,
     * with no score either way. A double DQ decides nothing.
     */
    if (disqualifiedA !== disqualifiedB) {
      return disqualifiedA ? entrantB : entrantA
    }

    // Fall back to the scores, which is how most hand-kept files are written.
    if (scoreA === null || scoreB === null || scoreA === scoreB) {
      return null
    }

    return scoreA > scoreB ? entrantA : entrantB
  }

  private number(value: string | undefined, label: string): number | null {
    try {
      return optionalNumber(value)
    } catch (error) {
      throw new PermanentPlatformError(`Could not read the ${label}: ${(error as Error).message}`, {
        platform: this.key,
        cause: error,
      })
    }
  }

  private parse(input: string, label: string) {
    try {
      return parseCsv(input)
    } catch (error) {
      if (error instanceof CsvError) {
        throw new PermanentPlatformError(`Could not read the ${label} file: ${error.message}`, {
          platform: this.key,
          cause: error,
        })
      }
      throw error
    }
  }
}
