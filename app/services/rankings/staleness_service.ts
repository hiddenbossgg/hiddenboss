import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Ranking from '#models/ranking'

/**
 * Flags a league's rankings as needing a recompute.
 *
 * Rankings are manual by default so admins can fix identity mistakes before
 * standings move publicly, and because recomputing every ranking on every
 * import is quadratic in tournaments over a season. Ids of `auto` rankings are
 * returned for the caller to queue immediately.
 */
export class StalenessService {
  /**
   * @returns ids of rankings that recompute automatically
   */
  async markLeagueStale(leagueId: string, options: { tournamentsAdded?: number } = {}) {
    const rankings = await Ranking.query().where('leagueId', leagueId)
    if (rankings.length === 0) return []

    await db.from('rankings').where('league_id', leagueId).update({
      recompute_requested_at: DateTime.now().toSQL(),
    })

    if (options.tournamentsAdded) {
      await db
        .from('rankings')
        .where('league_id', leagueId)
        .increment('stale_tournament_count', options.tournamentsAdded)
    }

    return rankings
      .filter((ranking) => ranking.recomputeMode === 'auto')
      .map((ranking) => ranking.id)
  }

  /** Used when an admin presses "update rankings". */
  async request(rankingId: string): Promise<void> {
    await Ranking.query()
      .where('id', rankingId)
      .update({ recompute_requested_at: DateTime.now().toSQL() })
  }
}
