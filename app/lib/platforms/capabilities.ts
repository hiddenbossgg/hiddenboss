import type { CanonicalBracket, CanonicalEntrant } from './canonical.js'

/**
 * What an import actually contained.
 *
 * Observed rather than declared, because support varies by game within a single
 * platform — start.gg reports character selections for some and not others.
 *
 * `participantIds` decides whether identity resolution can key on a stable
 * account or must fall back to tag matching.
 */
export interface ObservedCapabilities {
  participantIds: boolean
  seeds: boolean
  placements: boolean
  games: boolean
  characterSelections: boolean
  stages: boolean
}

export function emptyCapabilities(): ObservedCapabilities {
  return {
    participantIds: false,
    seeds: false,
    placements: false,
    games: false,
    characterSelections: false,
    stages: false,
  }
}

/**
 * Accumulates capabilities as records stream past.
 *
 * Deliberately monotonic: any single occurrence flips a flag on and nothing
 * turns it off. A bracket with no character data does not disprove that the
 * platform reports characters, it just means that bracket had none.
 */
export class CapabilityObserver {
  private readonly observed = emptyCapabilities()

  get result(): ObservedCapabilities {
    return { ...this.observed }
  }

  observeEntrants(entrants: CanonicalEntrant[]): void {
    for (const entrant of entrants) {
      if (entrant.seed !== null) this.observed.seeds = true
      if (entrant.placement !== null) this.observed.placements = true

      for (const participant of entrant.participants) {
        if (participant.externalUserId !== null) this.observed.participantIds = true
      }
    }
  }

  observeBracket(bracket: CanonicalBracket): void {
    for (const set of bracket.sets) {
      if (set.games.length > 0) this.observed.games = true

      for (const game of set.games) {
        if (game.stage !== null) this.observed.stages = true
        if (game.selections.length > 0) this.observed.characterSelections = true
      }
    }
  }
}
