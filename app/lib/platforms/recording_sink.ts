import type { ImportSink } from './contracts.js'
import type {
  CanonicalBracket,
  CanonicalEntrant,
  CanonicalEvent,
  CanonicalPhase,
  CanonicalTournament,
} from './canonical.js'

/** One recorded call, in the order it was made. */
export type SinkCall =
  | { name: 'tournament'; tournament: CanonicalTournament }
  | { name: 'event'; event: CanonicalEvent }
  | { name: 'entrants'; eventExternalId: string; entrants: CanonicalEntrant[] }
  | { name: 'phase'; eventExternalId: string; phase: CanonicalPhase }
  | {
      name: 'bracket'
      eventExternalId: string
      phaseExternalId: string
      bracket: CanonicalBracket
    }
  | { name: 'progress'; completed: number; total: number | null; label?: string }

/**
 * An `ImportSink` that writes nothing and remembers everything.
 *
 * Lets an adapter be run with no database — by its unit tests, and by
 * `record:platform-fixtures`, which only needs somewhere for the records to go
 * while it captures the HTTP traffic underneath.
 *
 * Comparing two runs' `calls` is how an adapter's determinism is checked; that
 * is the one contract requirement no single run can observe, so it cannot move
 * into `ValidatingSink`.
 */
export class RecordingSink implements ImportSink {
  readonly calls: SinkCall[] = []

  async tournament(tournament: CanonicalTournament): Promise<void> {
    this.calls.push({ name: 'tournament', tournament })
  }

  async event(event: CanonicalEvent): Promise<void> {
    this.calls.push({ name: 'event', event })
  }

  async entrants(eventExternalId: string, entrants: CanonicalEntrant[]): Promise<void> {
    this.calls.push({ name: 'entrants', eventExternalId, entrants })
  }

  async phase(eventExternalId: string, phase: CanonicalPhase): Promise<void> {
    this.calls.push({ name: 'phase', eventExternalId, phase })
  }

  async bracket(
    eventExternalId: string,
    phaseExternalId: string,
    bracket: CanonicalBracket
  ): Promise<void> {
    this.calls.push({ name: 'bracket', eventExternalId, phaseExternalId, bracket })
  }

  async progress(completed: number, total: number | null, label?: string): Promise<void> {
    this.calls.push({ name: 'progress', completed, total, label })
  }

  private of<TName extends SinkCall['name']>(name: TName): Extract<SinkCall, { name: TName }>[] {
    return this.calls.filter(
      (call): call is Extract<SinkCall, { name: TName }> => call.name === name
    )
  }

  get tournaments(): CanonicalTournament[] {
    return this.of('tournament').map((call) => call.tournament)
  }

  get events(): CanonicalEvent[] {
    return this.of('event').map((call) => call.event)
  }

  /** One entry per call, since a platform may page its entrants. */
  get entrantBatches() {
    return this.of('entrants')
  }

  /** Every entrant across every batch, which is what most assertions want. */
  get allEntrants(): CanonicalEntrant[] {
    return this.entrantBatches.flatMap((call) => call.entrants)
  }

  get phases() {
    return this.of('phase')
  }

  get brackets() {
    return this.of('bracket')
  }
}
