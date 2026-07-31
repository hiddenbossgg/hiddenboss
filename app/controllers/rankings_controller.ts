import Ranking from '#models/ranking'
import RankingRecompute from '#models/ranking_recompute'
import RankingStanding from '#models/ranking_standing'
import RecomputeRankingJob from '#jobs/recompute_ranking_job'
import LeaguePolicy from '#policies/league_policy'
import { StalenessService } from '#services/rankings/staleness_service'
import { createRankingValidator } from '#validators/ranking'
import type { HttpContext } from '@adonisjs/core/http'

export default class RankingsController {
  /** Every ranking in the league, public. */
  async index({ league, bouncer, inertia }: HttpContext) {
    const rankings = await Ranking.query().where('leagueId', league.id).orderBy('name')

    return inertia.render('leagues/rankings', {
      league: { slug: league.slug, name: league.name },
      canManage: await bouncer.with(LeaguePolicy).allows('manage', league),
      rankings: rankings.map((ranking) => ({
        slug: ranking.slug,
        name: ranking.name,
        algorithm: ranking.algorithm,
        published: ranking.published,
        isStale: ranking.recomputeRequestedAt !== null,
        staleCount: ranking.staleTournamentCount,
        hasRecompute: ranking.latestRecomputeId !== null,
      })),
    })
  }

  /**
   * A ranking's standings.
   *
   * Read from the latest completed run rather than computed here — that is what
   * keeps this a single indexed read and makes the page cacheable.
   */
  async show({ league, params, bouncer, response, inertia }: HttpContext) {
    const ranking = await Ranking.query()
      .where('leagueId', league.id)
      .where('slug', params.ranking)
      .first()

    if (!ranking) {
      return response.notFound({ message: 'No such ranking' })
    }

    const standings = ranking.latestRecomputeId
      ? await RankingStanding.query()
          .where('rankingRecomputeId', ranking.latestRecomputeId)
          .preload('leaguePlayer')
          .orderBy('rank')
      : []

    return inertia.render('leagues/ranking', {
      league: { slug: league.slug, name: league.name },
      canManage: await bouncer.with(LeaguePolicy).allows('manage', league),
      ranking: {
        slug: ranking.slug,
        name: ranking.name,
        algorithm: ranking.algorithm,
        isStale: ranking.recomputeRequestedAt !== null,
        staleCount: ranking.staleTournamentCount,
        hasRecompute: ranking.latestRecomputeId !== null,
        /**
         * A worker is replaying this ranking right now. Distinct from
         * `isStale`, which is also true for a manual ranking waiting on an
         * admin — polling on that alone would never stop.
         */
        isRecomputing:
          (await RankingRecompute.query()
            .where('rankingId', ranking.id)
            .where('status', 'running')
            .first()) !== null,
      },
      standings: standings.map((standing) => ({
        rank: standing.rank,
        previousRank: standing.previousRank,
        player: standing.leaguePlayer.displayTag,
        playerSlug: standing.leaguePlayer.slug,
        // Postgres returns numeric as a string; ratings are whole numbers here.
        rating: Math.round(Number(standing.value)),
        wins: standing.wins,
        losses: standing.losses,
        setsPlayed: standing.setsPlayed,
      })),
    })
  }

  async create({ league, inertia }: HttpContext) {
    return inertia.render('leagues/ranking_create', {
      league: { slug: league.slug, name: league.name },
    })
  }

  async store({ league, request, response }: HttpContext) {
    const payload = await request.validateUsing(createRankingValidator)

    const ranking = await Ranking.create({
      leagueId: league.id,
      name: payload.name,
      slug: payload.slug,
      algorithm: payload.algorithm,
      recomputeMode: payload.recomputeMode ?? 'manual',
      published: true,
    })

    // Queue the first build so a new ranking is not permanently empty.
    await new StalenessService().request(ranking.id)
    await RecomputeRankingJob.dispatch({ rankingId: ranking.id })

    return response
      .redirect()
      .toRoute('rankings.show', { league: league.slug, ranking: ranking.slug })
  }

  /** The "update rankings" button. */
  async recompute({ league, params, response, session }: HttpContext) {
    const ranking = await Ranking.query()
      .where('leagueId', league.id)
      .where('slug', params.ranking)
      .firstOrFail()

    await new StalenessService().request(ranking.id)
    await RecomputeRankingJob.dispatch({ rankingId: ranking.id })

    session.flash('success', `Updating ${ranking.name}`)

    return response
      .redirect()
      .toRoute('rankings.show', { league: league.slug, ranking: ranking.slug })
  }
}
