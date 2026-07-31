import { glicko2 } from 'glicko2-lite'
import type { RankingAlgorithm, RatableSet, Standing, ValueDelta } from './contracts.js'

export interface Glicko2Config {
  /** Rating a new player starts on, on the familiar 1500-centred scale. */
  initial: number
  /** Starting deviation. Higher means the rating moves further per result. */
  initialDeviation: number
  /** Starting volatility — how erratic the player's results are expected to be. */
  initialVolatility: number
  /**
   * System constant τ, constraining how much volatility may move per period.
   * Glickman suggests 0.3–1.2; smaller is steadier.
   */
  tau: number
}

export const GLICKO2_DEFAULTS: Glicko2Config = {
  initial: 1500,
  initialDeviation: 350,
  initialVolatility: 0.06,
  tau: 0.5,
}

export interface Glicko2Player {
  rating: number
  deviation: number
  volatility: number
  wins: number
  losses: number
  setsPlayed: number
}

export interface Glicko2State {
  config: Glicko2Config
  players: Map<string, Glicko2Player>
}

/**
 * Glicko-2, rating each set as its own period.
 *
 * The mathematics comes from `glicko2-lite`, which takes a player's rating,
 * deviation and volatility plus the opponents faced in a rating period. State
 * stays here so the algorithm keeps the contract's shape: no hidden registry, no
 * ordering surprises across a replay.
 *
 * Glickman defines a rating period as a batch of games, and grouping ours by
 * tournament would be the truer reading. It is not what happens here, because
 * `ranking_set_deltas` records the rating change caused by each individual set —
 * a period-based update yields one change for a whole tournament with no
 * defensible way to attribute it to the sets inside it.
 *
 * Team sets are skipped, as under Elo: splitting one result across several
 * players is a modelling decision Glicko-2 does not make.
 */
export class Glicko2 implements RankingAlgorithm<Glicko2State> {
  readonly key = 'glicko2'

  private readonly config: Glicko2Config

  constructor(config: Partial<Glicko2Config> = {}) {
    this.config = { ...GLICKO2_DEFAULTS, ...config }
  }

  init(): Glicko2State {
    return { config: this.config, players: new Map() }
  }

  applySet(state: Glicko2State, set: RatableSet): ValueDelta[] {
    if (set.sideA.length !== 1 || set.sideB.length !== 1) {
      return []
    }

    const [a] = set.sideA
    const [b] = set.sideB

    // A player cannot be rated against themselves; this shows up in real data.
    if (a === b) return []

    const playerA = this.playerFor(state, a)
    const playerB = this.playerFor(state, b)

    const beforeA = { ...playerA }
    const beforeB = { ...playerB }
    const aWon = set.winner === 'a'

    /**
     * Both updates read the pre-set values, so which of the two is written first
     * cannot change the outcome.
     */
    const nextA = glicko2(
      beforeA.rating,
      beforeA.deviation,
      beforeA.volatility,
      [[beforeB.rating, beforeB.deviation, aWon ? 1 : 0]],
      { tau: state.config.tau }
    )

    const nextB = glicko2(
      beforeB.rating,
      beforeB.deviation,
      beforeB.volatility,
      [[beforeA.rating, beforeA.deviation, aWon ? 0 : 1]],
      { tau: state.config.tau }
    )

    playerA.rating = nextA.rating
    playerA.deviation = nextA.rd
    playerA.volatility = nextA.vol

    playerB.rating = nextB.rating
    playerB.deviation = nextB.rd
    playerB.volatility = nextB.vol

    playerA.setsPlayed += 1
    playerB.setsPlayed += 1

    if (aWon) {
      playerA.wins += 1
      playerB.losses += 1
    } else {
      playerB.wins += 1
      playerA.losses += 1
    }

    return [
      { leaguePlayerId: a, before: beforeA.rating, after: playerA.rating },
      { leaguePlayerId: b, before: beforeB.rating, after: playerB.rating },
    ]
  }

  finalize(state: Glicko2State): Standing[] {
    return [...state.players.entries()]
      .map(([leaguePlayerId, player]) => ({
        leaguePlayerId,
        value: player.rating,
        deviation: player.deviation,
        volatility: player.volatility,
        wins: player.wins,
        losses: player.losses,
        setsPlayed: player.setsPlayed,
      }))
      .sort((left, right) => right.value - left.value)
  }

  serialize(state: Glicko2State): unknown {
    return {
      config: state.config,
      players: Object.fromEntries(state.players),
    }
  }

  private playerFor(state: Glicko2State, id: string): Glicko2Player {
    let player = state.players.get(id)

    if (!player) {
      player = {
        rating: state.config.initial,
        deviation: state.config.initialDeviation,
        volatility: state.config.initialVolatility,
        wins: 0,
        losses: 0,
        setsPlayed: 0,
      }
      state.players.set(id, player)
    }

    return player
  }
}
