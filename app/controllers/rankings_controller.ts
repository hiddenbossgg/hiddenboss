import Ranking from '#models/ranking'
import RankingRecompute from '#models/ranking_recompute'
import RankingStanding from '#models/ranking_standing'
import RecomputeRankingJob from '#jobs/recompute_ranking_job'
import LeaguePolicy from '#policies/league_policy'
import { StalenessService } from '#services/rankings/staleness_service'
import { createRankingValidator, updateRankingValidator } from '#validators/ranking'
import { DEFAULT_DQ_POLICY, meetsActivityRequirements } from '#lib/rankings/activity_requirements'
import type { ActivityRequirement, DqPolicy } from '#lib/rankings/activity_requirements'
import type { HttpContext } from '@adonisjs/core/http'

function activityRequirementsOf(ranking: Ranking): ActivityRequirement[] {
  return (ranking.activityRequirements ?? []) as ActivityRequirement[]
}

/** Normalises `minEntrants` to an explicit `null` rather than an absent key, so a stored clause always matches `ActivityRequirement`. */
function normaliseActivityRequirements(
  requirements: Array<{ count: number; minEntrants?: number }> | undefined
): ActivityRequirement[] {
  return (requirements ?? []).map((requirement) => ({
    count: requirement.count,
    minEntrants: requirement.minEntrants ?? null,
  }))
}

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

    const allStandings = ranking.latestRecomputeId
      ? await RankingStanding.query()
          .where('rankingRecomputeId', ranking.latestRecomputeId)
          .preload('leaguePlayer')
          .orderBy('rank')
      : []

    /**
     * Applied here rather than at recompute time — a player becomes
     * ineligible because the requirements changed, not because any data did.
     * Rank numbers are left as computed, so a player sitting just under a
     * clause does not shift everyone below them.
     *
     * `flagInactive` chooses how that ineligibility is shown: dropped from
     * the page entirely (the default), or kept and marked, which a league
     * wants when players are close and visibility matters more than a clean
     * cutoff.
     */
    const requirements = activityRequirementsOf(ranking)
    const dqPolicy = (ranking.dqPolicy ?? DEFAULT_DQ_POLICY) as DqPolicy
    const inactive = (standing: RankingStanding) =>
      requirements.length > 0 &&
      !meetsActivityRequirements(standing.tournamentActivity ?? [], requirements, dqPolicy)

    const standings =
      requirements.length > 0 && !ranking.flagInactive
        ? allStandings.filter((standing) => !inactive(standing))
        : allStandings

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
        startsAt: ranking.startsAt?.toISODate() ?? null,
        endsAt: ranking.endsAt?.toISODate() ?? null,
        activityRequirements: requirements,
        flagInactive: ranking.flagInactive,
        dqPolicy,
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
        eventsCounted: standing.eventsCounted,
        inactive: inactive(standing),
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
      startsAt: payload.startsAt ?? null,
      endsAt: payload.endsAt ?? null,
      activityRequirements: normaliseActivityRequirements(payload.activityRequirements),
      flagInactive: payload.flagInactive ?? false,
      dqPolicy: payload.dqPolicy ?? DEFAULT_DQ_POLICY,
      published: true,
    })

    // Queue the first build so a new ranking is not permanently empty.
    await new StalenessService().request(ranking.id)
    await RecomputeRankingJob.dispatch({ rankingId: ranking.id })

    return response
      .redirect()
      .toRoute('rankings.show', { league: league.slug, ranking: ranking.slug })
  }

  async edit({ league, params, response, inertia }: HttpContext) {
    const ranking = await Ranking.query()
      .where('leagueId', league.id)
      .where('slug', params.ranking)
      .first()

    if (!ranking) {
      return response.notFound({ message: 'No such ranking' })
    }

    return inertia.render('leagues/ranking_edit', {
      league: { slug: league.slug, name: league.name },
      ranking: {
        slug: ranking.slug,
        name: ranking.name,
        startsAt: ranking.startsAt?.toISODate() ?? null,
        endsAt: ranking.endsAt?.toISODate() ?? null,
        activityRequirements: activityRequirementsOf(ranking),
        flagInactive: ranking.flagInactive,
        dqPolicy: (ranking.dqPolicy ?? DEFAULT_DQ_POLICY) as DqPolicy,
      },
    })
  }

  async update({ league, params, request, response, session }: HttpContext) {
    const ranking = await Ranking.query()
      .where('leagueId', league.id)
      .where('slug', params.ranking)
      .firstOrFail()

    const payload = await request.validateUsing(updateRankingValidator)

    const dateRangeChanged =
      (payload.startsAt?.toISODate() ?? null) !== (ranking.startsAt?.toISODate() ?? null) ||
      (payload.endsAt?.toISODate() ?? null) !== (ranking.endsAt?.toISODate() ?? null)

    ranking.merge({
      startsAt: payload.startsAt ?? null,
      endsAt: payload.endsAt ?? null,
      activityRequirements: normaliseActivityRequirements(payload.activityRequirements),
      flagInactive: payload.flagInactive ?? false,
      dqPolicy: payload.dqPolicy ?? DEFAULT_DQ_POLICY,
    })
    await ranking.save()

    /**
     * The date range bounds which sets are selected for rating, so standings
     * are now behind the ranking's own config and need replaying. Activity
     * requirements and the DQ policy are a read-time filter over data that
     * has not changed, so on their own they never need a recompute — each
     * standing already stores `setsPlayed`/`timesDisqualified` per
     * tournament, not just whichever policy was active when it was written.
     */
    if (dateRangeChanged) {
      await new StalenessService().request(ranking.id)
      await RecomputeRankingJob.dispatch({ rankingId: ranking.id })
    }

    session.flash('success', `Updated ${ranking.name}`)

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
