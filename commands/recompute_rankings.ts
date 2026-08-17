import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import League from '#models/league'
import Ranking from '#models/ranking'
import { RankingRecomputerService } from '#services/rankings/ranking_recomputer_service'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Recomputes a league's rankings synchronously, with no worker involved.
 *
 * Useful for debugging a recompute and for a self-hoster who wants to force one
 * without going through the UI.
 */
export default class RecomputeRankings extends BaseCommand {
  static commandName = 'rankings:recompute'
  static description = "Recompute a league's rankings, synchronously"

  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'League slug' })
  declare league: string

  @flags.string({ description: 'Ranking slug. Omit to recompute them all.' })
  declare ranking: string

  /** Creates a ranking first, so a fresh league can be exercised in one step. */
  @flags.string({ description: 'Create a ranking with this name before recomputing' })
  declare create: string

  /**
   * For when the replay logic changed in a way the fingerprint cannot see —
   * it only tracks algorithm config, requirements, and the sets themselves.
   * Never work around a stale skip by clearing `latest_recompute_id` by
   * hand: that also erases the baseline the Move column compares against.
   */
  @flags.boolean({ description: 'Recompute even if nothing the fingerprint tracks has changed' })
  declare force: boolean

  async run() {
    const league = await League.findBy('slug', this.league)
    if (!league) {
      this.logger.error(`No league with slug "${this.league}"`)
      this.exitCode = 1
      return
    }

    if (this.create) {
      const slug = this.create.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      await Ranking.updateOrCreate(
        { leagueId: league.id, slug },
        { name: this.create, algorithm: 'elo', recomputeMode: 'manual', published: true }
      )
    }

    const query = Ranking.query().where('leagueId', league.id)
    if (this.ranking) query.where('slug', this.ranking)

    const rankings = await query
    if (rankings.length === 0) {
      this.logger.warning('No rankings to recompute')
      return
    }

    for (const ranking of rankings) {
      const result = await new RankingRecomputerService().run(ranking.id, { force: this.force })

      this.logger.success(
        result.skipped
          ? `${ranking.name}: already up to date`
          : `${ranking.name}: ${result.recompute.playerCount} players, ${result.recompute.setCount} sets rated`
      )
    }
  }
}
