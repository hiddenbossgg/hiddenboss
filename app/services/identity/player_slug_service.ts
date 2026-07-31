import LeaguePlayer from '#models/league_player'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * Slugs for league players.
 *
 * Shared because players are created down two paths — an import resolving an
 * unrecognised account, and an admin splitting one out by hand — and both need
 * the same answer for what a player's URL should be.
 */
export class PlayerSlugService {
  /**
   * Player slugs appear in public profile URLs and are unique per league, so a
   * second `zain` gets a suffix rather than failing the whole import.
   */
  async unique(trx: TransactionClientContract, leagueId: string, source: string): Promise<string> {
    const base =
      source
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'player'

    for (let suffix = 0; ; suffix += 1) {
      const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`
      const taken = await LeaguePlayer.query({ client: trx })
        .where('leagueId', leagueId)
        .where('slug', candidate)
        .first()

      if (!taken) return candidate
    }
  }
}
