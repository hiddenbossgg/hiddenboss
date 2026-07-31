import { ordinal, rate, rating } from 'openskill'
import type { Rating } from 'openskill'
import type { RankingAlgorithm, RatableSet, Standing, ValueDelta } from './contracts.js'

export interface OpenSkillConfig {
  /** Mean skill a new player starts on. */
  mu: number
  /** Starting uncertainty. Convention is mu / 3. */
  sigma: number
  /**
   * How many standard deviations below the mean the published number sits.
   * Three is the usual choice: a rating you are ~99.7% confident is deserved,
   * which is why a new player starts low and climbs as they play.
   */
  z: number
}

export const OPENSKILL_DEFAULTS: OpenSkillConfig = {
  mu: 25,
  sigma: 25 / 3,
  z: 3,
}

export interface OpenSkillPlayer {
  mu: number
  sigma: number
  wins: number
  losses: number
  setsPlayed: number
}

export interface OpenSkillState {
  config: OpenSkillConfig
  players: Map<string, OpenSkillPlayer>
}

/**
 * OpenSkill: a Bayesian skill rating, from the `openskill` package.
 *
 * Weng-Lin rather than TrueSkill™ deliberately — the same family of model,
 * without Microsoft's patent hanging over a self-hostable project.
 *
 * The published value is the conservative estimate `mu - z * sigma` rather than
 * `mu`, so a newcomer with a lucky win does not appear above an established
 * player. It starts near zero on the default settings and rises as uncertainty
 * falls, which is worth knowing before wondering why everybody begins on 0.
 *
 * A set here is two sides of 1..N, so team results are rated rather than
 * skipped. That falls out of the library and matches what an entrant is; it is
 * not the reason to choose this algorithm.
 */
export class OpenSkill implements RankingAlgorithm<OpenSkillState> {
  readonly key = 'openskill'

  private readonly config: OpenSkillConfig

  constructor(config: Partial<OpenSkillConfig> = {}) {
    this.config = { ...OPENSKILL_DEFAULTS, ...config }
  }

  init(): OpenSkillState {
    return { config: this.config, players: new Map() }
  }

  applySet(state: OpenSkillState, set: RatableSet): ValueDelta[] {
    if (set.sideA.length === 0 || set.sideB.length === 0) {
      return []
    }

    /**
     * A player on both sides cannot be rated: the model would have them beating
     * themselves. Rare, but it happens where identity resolution has merged two
     * accounts that entered the same team event separately.
     */
    const overlap = set.sideA.some((id) => set.sideB.includes(id))
    if (overlap) return []

    const before = new Map<string, number>()
    for (const id of [...set.sideA, ...set.sideB]) {
      before.set(id, this.valueOf(this.playerFor(state, id)))
    }

    const teamA = set.sideA.map((id) => this.ratingOf(state, id))
    const teamB = set.sideB.map((id) => this.ratingOf(state, id))

    /** Rank 1 is the winner; openskill orders teams by rank ascending. */
    const [nextA, nextB] = rate([teamA, teamB], {
      rank: set.winner === 'a' ? [1, 2] : [2, 1],
    })

    const deltas: ValueDelta[] = []

    for (const [side, updated, won] of [
      [set.sideA, nextA, set.winner === 'a'],
      [set.sideB, nextB, set.winner === 'b'],
    ] as const) {
      side.forEach((id, index) => {
        const player = this.playerFor(state, id)
        player.mu = updated[index].mu
        player.sigma = updated[index].sigma
        player.setsPlayed += 1

        if (won) player.wins += 1
        else player.losses += 1

        deltas.push({
          leaguePlayerId: id,
          before: before.get(id)!,
          after: this.valueOf(player),
        })
      })
    }

    return deltas
  }

  finalize(state: OpenSkillState): Standing[] {
    return [...state.players.entries()]
      .map(([leaguePlayerId, player]) => ({
        leaguePlayerId,
        value: this.valueOf(player),
        /** Uncertainty is meaningful here, so it is published alongside. */
        deviation: player.sigma,
        volatility: null,
        wins: player.wins,
        losses: player.losses,
        setsPlayed: player.setsPlayed,
      }))
      .sort((left, right) => right.value - left.value)
  }

  serialize(state: OpenSkillState): unknown {
    return {
      config: state.config,
      players: Object.fromEntries(state.players),
    }
  }

  /** The conservative estimate, which is what gets published as the rating. */
  private valueOf(player: OpenSkillPlayer): number {
    return ordinal({ mu: player.mu, sigma: player.sigma }, { z: this.config.z })
  }

  private ratingOf(state: OpenSkillState, id: string): Rating {
    const player = this.playerFor(state, id)
    return { mu: player.mu, sigma: player.sigma }
  }

  private playerFor(state: OpenSkillState, id: string): OpenSkillPlayer {
    let player = state.players.get(id)

    if (!player) {
      const fresh = rating({ mu: state.config.mu, sigma: state.config.sigma })
      player = { mu: fresh.mu, sigma: fresh.sigma, wins: 0, losses: 0, setsPlayed: 0 }
      state.players.set(id, player)
    }

    return player
  }
}
