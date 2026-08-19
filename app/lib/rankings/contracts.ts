/**
 * The contract every rating system implements.
 *
 * Algorithms are pure: no database access, no clock, no configuration beyond
 * what is passed in, so they can be tested against published reference values
 * rather than against our own output.
 */

/** One set, resolved to league players and stripped of platform detail. */
export interface RatableSet {
  setId: string
  tournamentId: string
  /**
   * The tournament's own date. Used as the time axis for per-tournament standings, because a
   * set's completion time is frequently missing and always missing for CSV
   * imports, while a tournament almost always has a date.
   */
  tournamentStartAt: Date | null
  /** Players on side A. More than one means a team set. */
  sideA: string[]
  sideB: string[]
  /** Which side won. Draws are not modelled: brackets do not produce them. */
  winner: 'a' | 'b'
  /** For ordering and for reporting when a rating moved. */
  occurredAt: Date | null
  /**
   * The size of the event this set came from, for activity requirements like
   * "3 tournaments with 8+ entrants". Null when the platform never reported
   * one — CSV imports, mainly.
   */
  entrantCount: number | null
  /**
   * Whether that side was disqualified in this set. Never affects rating —
   * a walkover still moves rating — but it is what lets a ranking's DQ
   * policy tell a no-show from a tournament actually played.
   */
  sideADisqualified: boolean
  sideBDisqualified: boolean
}

export interface ValueDelta {
  leaguePlayerId: string
  before: number
  after: number
}

export interface Standing {
  leaguePlayerId: string
  value: number
  deviation: number | null
  volatility: number | null
  wins: number
  losses: number
  setsPlayed: number
}

export interface RankingAlgorithm<TState> {
  readonly key: string

  init(): TState

  /**
   * Applies one set, returning what changed.
   *
   * Returning an empty array means the set was not rated — a team set
   * under Elo, for instance. The caller uses that to decide what to record,
   * so "ignored" and "no change" must not be confused.
   */
  applySet(state: TState, set: RatableSet): ValueDelta[]

  finalize(state: TState): Standing[]

  /** Serialised onto the recompute, so incremental resume can be added later. */
  serialize(state: TState): unknown
}
