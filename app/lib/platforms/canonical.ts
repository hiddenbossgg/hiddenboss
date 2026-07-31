/**
 * The canonical tournament model. Adapters convert their own payloads into these
 * types; nothing downstream ever sees a platform-specific shape.
 *
 *   Tournament -> Event -> Phase -> Bracket -> Set -> Game -> Selection
 *
 * A bracket (start.gg calls it a phase group) is the unit sets are fetched by on
 * multi-phase platforms, so it is also the unit of import progress. Platforms
 * with a single bracket emit one event, one phase, one bracket.
 */

export type EntryKind = 'singles' | 'doubles' | 'crew' | 'other'

export type SetState = 'pending' | 'started' | 'completed'

/**
 * Bracket formats we can describe. Adapters map their own enums onto these and
 * fall back to `other` rather than inventing a value.
 */
export type BracketType =
  'single_elimination' | 'double_elimination' | 'round_robin' | 'swiss' | 'other'

/**
 * A person as a platform reported them, at a point in time.
 *
 * `externalUserId` is the stable, cross-tournament account id where the
 * platform has such a concept (start.gg's user id, parry.gg's UUIDv7). It is
 * absent on platforms whose participants only exist within one tournament,
 * which is precisely what forces those imports onto tag matching.
 */
export interface CanonicalParticipant {
  externalUserId: string | null
  gamerTag: string
  prefix: string | null
  pronouns: string | null
}

/**
 * A competitor slot in an event: one player for singles, several for doubles
 * or crews.
 */
export interface CanonicalEntrant {
  externalId: string
  name: string
  seed: number | null
  placement: number | null
  isDisqualified: boolean
  participants: CanonicalParticipant[]
}

export interface CanonicalSelection {
  entrantExternalId: string
  /** Null when the platform reports a pick without saying who made it. */
  participantExternalUserId: string | null
  /** Platform-native character identifier, mapped to our catalog later. */
  character: string
}

export interface CanonicalGame {
  /** 1-indexed. */
  number: number
  winnerEntrantExternalId: string | null
  stage: string | null
  selections: CanonicalSelection[]
}

export interface CanonicalSet {
  externalId: string
  state: SetState
  /** Negative rounds conventionally mean losers side. */
  round: number | null
  identifier: string | null
  fullRoundText: string | null
  /**
   * Display order within a bracket. Null is normal and expected: start.gg leaves
   * it unset outside double elimination, as does challonge for swiss.
   */
  ordinal: number | null
  entrantAExternalId: string | null
  entrantBExternalId: string | null
  winnerEntrantExternalId: string | null
  scoreA: number | null
  scoreB: number | null
  /**
   * Whether that side was disqualified from this set — a no-show, a late arrival,
   * a ruling. Per side, so a double DQ is representable.
   *
   * Explicit because platforms encode it as a magic score: start.gg reports the
   * disqualified side as `-1`. Left to leak, core would have to know that
   * convention to tell a walkover from a played set, and a `-1` would reach the
   * UI as a score. Adapters translate it here instead, and report no score for a
   * side that never played.
   *
   * Distinct from `CanonicalEntrant.isDisqualified`, which means removed from the
   * whole event rather than from one set.
   */
  entrantADisqualified: boolean
  entrantBDisqualified: boolean
  completedAt: Date | null
  games: CanonicalGame[]
}

export interface CanonicalBracket {
  externalId: string
  name: string | null
  bracketType: BracketType
  sets: CanonicalSet[]
}

export interface CanonicalPhase {
  externalId: string
  name: string | null
  order: number | null
}

export interface CanonicalEvent {
  externalId: string
  name: string
  /** Platform-native game name or identifier, mapped to our catalog later. */
  game: string | null
  entryKind: EntryKind
  teamSize: number | null
  entrantCount: number | null
}

export interface CanonicalTournament {
  externalId: string
  slug: string
  name: string
  url: string | null
  startAt: Date | null
  endAt: Date | null
  location: string | null
  isOnline: boolean | null
}
