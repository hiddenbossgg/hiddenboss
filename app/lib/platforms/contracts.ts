import type vine from '@vinejs/vine'
import type { Logger } from '@adonisjs/core/logger'
import type {
  CanonicalEntrant,
  CanonicalEvent,
  CanonicalPhase,
  CanonicalBracket,
  CanonicalTournament,
} from './canonical.js'

/** Registry key for a platform, e.g. `startgg`. Never a database enum. */
export type PlatformKey = string

/** Any schema `vine.compile()` accepts. Vine owns credential validation. */
export type CredentialSchema = Parameters<typeof vine.compile>[0]

/**
 * An event an adapter recognised from a pasted link.
 *
 * An event is the unit of import: a tournament holds several, and a league
 * usually wants one of them. Importing an event hydrates its tournament as the
 * parent, so a second import of a sibling event joins the same tournament.
 *
 * `slug` is whatever that platform uses to address the event again later, so
 * re-importing never needs the original URL to be kept. It is opaque to core —
 * only the adapter interprets it, which is also why a link that names a
 * tournament without an event can be recognised here and rejected by
 * `fetchEvent` with guidance rather than looking like an unsupported URL.
 *
 * `payload` is opaque adapter input for sources not addressed by URL, such as an
 * uploaded CSV. Core stores and returns it without inspecting it, so file-based
 * imports share this contract rather than needing a parallel one.
 */
export interface EventRef {
  platform: PlatformKey
  slug: string
  url: string | null
  payload?: Record<string, unknown>
}

/**
 * Presentation metadata for the credentials form.
 *
 * Validation lives entirely in the Vine schema; this only decides what the
 * field is called and how it is rendered, so the worst case for a mismatch is
 * a missing label rather than an accepted bad value.
 */
export interface CredentialField {
  name: string
  label: string
  help?: string
  /** Rendered masked and never echoed back to the browser. */
  secret?: boolean
}

export interface CredentialsSpec {
  schema: CredentialSchema
  fields: CredentialField[]
}

/**
 * How fast the pipeline may call this platform, per credential.
 *
 * Declared by the adapter because the limits are the platform's, not ours, but
 * enforced generically. Where a platform documents no limit, adapters should
 * declare something conservative rather than omitting it.
 */
export interface RateLimit {
  requests: number
  perSeconds: number
}

/**
 * The HTTP function adapters must use instead of global `fetch`.
 *
 * Core's implementation applies this adapter's declared rate limit, retries
 * transient failures with backoff, honours `Retry-After`, and converts
 * failures into the shared error taxonomy. Routing every request through it is
 * what keeps pacing and retry logic written once rather than per adapter, and
 * it is also the seam that lets adapter tests replay recorded fixtures
 * with no network access at all.
 */
export type PlatformFetch = (input: string, init?: RequestInit) => Promise<Response>

/**
 * The parts of a stored platform account an adapter needs to point at that
 * user's public page on the platform.
 */
export interface PlatformAccountRef {
  externalUserId: string | null
  profileSlug: string | null
  gamerTag: string
}

export interface PlatformContext {
  /** Validated against the adapter's own schema before it gets here. */
  credentials: Record<string, string>
  http: PlatformFetch
  signal: AbortSignal
  logger: Logger
}

/**
 * Where an adapter sends what it converts.
 *
 * Adapters call these as they page rather than accumulating a result, so memory
 * stays bounded on a major and progress is reportable mid-fetch. The pipeline's
 * implementation writes each call idempotently; `RecordingSink` just remembers
 * it. An adapter cannot tell the difference, which is what lets adapter tests
 * run with no database.
 *
 * Every call must be awaited and its errors must propagate: the implementation
 * is how backpressure and cancellation reach the adapter, so swallowing an error
 * means an aborted import keeps fetching.
 *
 * Ordering contract, enforced at runtime by `ValidatingSink`, which every import
 * is wrapped in:
 *  - `tournament` is called exactly once, first, to hydrate the parent
 *  - `event` is called exactly once, and precedes its entrants, phases and
 *    brackets — an import covers one event, never a whole tournament
 *  - a `phase` precedes its own brackets
 *  - an event's `entrants` precede that event's brackets, so a set's entrant
 *    references can be checked as it arrives
 *  - `progress` may be called at any point
 */
export interface ImportSink {
  tournament(tournament: CanonicalTournament): Promise<void>
  event(event: CanonicalEvent): Promise<void>
  entrants(eventExternalId: string, entrants: CanonicalEntrant[]): Promise<void>
  phase(eventExternalId: string, phase: CanonicalPhase): Promise<void>
  bracket(
    eventExternalId: string,
    phaseExternalId: string,
    bracket: CanonicalBracket
  ): Promise<void>
  progress(completed: number, total: number | null, label?: string): Promise<void>
}

/**
 * Everything hiddenboss needs to import from a tournament platform.
 *
 * Adding a platform means implementing this and registering it. If it ever
 * requires a change outside the adapter's own directory, that is a defect in
 * this contract rather than a case to special-case.
 */
export interface PlatformAdapter {
  readonly key: PlatformKey
  readonly displayName: string

  /** Null when the platform needs no credentials, as with manual imports. */
  readonly credentials: CredentialsSpec | null

  readonly rateLimit: RateLimit

  /**
   * Returns a ref when this adapter recognises the link, otherwise null. Must
   * be pure and must not perform I/O: the registry calls it on every adapter
   * to work out who owns a pasted URL.
   *
   * Recognising a link is not the same as being able to import it. A link
   * naming a tournament rather than one of its events belongs to this adapter,
   * so it returns a ref; `fetchEvent` then rejects it with the event names to
   * choose from. Returning null there would surface as "no platform recognises
   * this URL", which is both wrong and unhelpful.
   *
   * Adapters with no URL form, such as manual imports, always return null and
   * are selected by key with a `payload` instead.
   */
  matchUrl(url: string): EventRef | null

  /**
   * The URL of one account's public profile on the platform.
   */
  profileUrl(account: PlatformAccountRef): string | null

  /**
   * Converts one event into canonical records, sending each to `sink` as it is
   * read, starting with the tournament that owns it.
   *
   * Implementations must be safe to run again after a partial failure, since
   * the pipeline retries transient errors, and must honour `context.signal`.
   * Errors from `sink` must propagate rather than be swallowed — that is how an
   * abort stops the fetch.
   */
  fetchEvent(ref: EventRef, context: PlatformContext, sink: ImportSink): Promise<void>
}
