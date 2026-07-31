import type { RatableSet, RankingAlgorithm, ValueDelta, Standing } from './contracts.js'

export interface EloConfig {
  initial: number
  k: number
  /** A larger K while a player's rating is still being established. */
  kProvisional: number
  provisionalSets: number
}

export const ELO_DEFAULTS: EloConfig = {
  initial: 1500,
  k: 32,
  kProvisional: 48,
  provisionalSets: 10,
}

interface PlayerState {
  rating: number
  wins: number
  losses: number
  setsPlayed: number
}

export interface EloState {
  config: EloConfig
  players: Map<string, PlayerState>
}

/**
 * Standard Elo.
 *
 * Team sets are deliberately not rated. Every team-credit convention —
 * mean rating, sum, best member — is arguable, and committing to one here
 * would silently bake it into published standings before TrueSkill exists to
 * do it properly. Doubles results are still imported and displayed; they just
 * do not move a skill rating.
 */
export class Elo implements RankingAlgorithm<EloState> {
  readonly key = 'elo'

  private readonly config: EloConfig

  constructor(config: Partial<EloConfig> = {}) {
    this.config = { ...ELO_DEFAULTS, ...config }
  }

  init(): EloState {
    return { config: this.config, players: new Map() }
  }

  applySet(state: EloState, set: RatableSet): ValueDelta[] {
    if (set.sideA.length !== 1 || set.sideB.length !== 1) {
      return []
    }

    const [a] = set.sideA
    const [b] = set.sideB

    // A player cannot be rated against themselves; this shows up in real data
    // when two entrants resolve to one person after a merge.
    if (a === b) {
      return []
    }

    const playerA = this.ensure(state, a)
    const playerB = this.ensure(state, b)

    const beforeA = playerA.rating
    const beforeB = playerB.rating

    const expectedA = expectedScore(beforeA, beforeB)
    const scoreA = set.winner === 'a' ? 1 : 0

    /**
     * K is chosen from each player's own history, so a newcomer's rating moves
     * quickly without dragging an established opponent around with it.
     */
    playerA.rating = beforeA + this.kFor(playerA) * (scoreA - expectedA)
    playerB.rating = beforeB + this.kFor(playerB) * (1 - scoreA - (1 - expectedA))

    playerA.setsPlayed += 1
    playerB.setsPlayed += 1

    if (set.winner === 'a') {
      playerA.wins += 1
      playerB.losses += 1
    } else {
      playerB.wins += 1
      playerA.losses += 1
    }

    return [
      { leaguePlayerId: a, before: beforeA, after: playerA.rating },
      { leaguePlayerId: b, before: beforeB, after: playerB.rating },
    ]
  }

  finalize(state: EloState): Standing[] {
    return [...state.players.entries()]
      .map(([leaguePlayerId, player]) => ({
        leaguePlayerId,
        value: player.rating,
        deviation: null,
        volatility: null,
        wins: player.wins,
        losses: player.losses,
        setsPlayed: player.setsPlayed,
      }))
      .sort((first, second) => second.value - first.value)
  }

  serialize(state: EloState): unknown {
    return {
      algorithm: this.key,
      config: state.config,
      players: Object.fromEntries(state.players),
    }
  }

  private ensure(state: EloState, leaguePlayerId: string): PlayerState {
    let player = state.players.get(leaguePlayerId)

    if (!player) {
      player = { rating: state.config.initial, wins: 0, losses: 0, setsPlayed: 0 }
      state.players.set(leaguePlayerId, player)
    }

    return player
  }

  private kFor(player: PlayerState): number {
    return player.setsPlayed < this.config.provisionalSets
      ? this.config.kProvisional
      : this.config.k
  }
}

/** The logistic expected score: the probability `a` beats `b`. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400))
}
