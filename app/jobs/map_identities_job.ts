import { Job } from '@adonisjs/queue'
import RecomputeRankingJob from '#jobs/recompute_ranking_job'
import { IdentityResolverService } from '#services/identity/identity_resolver_service'
import { StalenessService } from '#services/rankings/staleness_service'
import type { JobOptions } from '@adonisjs/queue/types'

type MapIdentitiesPayload = {
  leagueId: string
  eventId: string
}

/**
 * Maps an imported tournament's platform accounts onto league players.
 *
 * Chained after a successful import rather than folded into it: tournament data
 * is shared across the instance while identity is league-scoped, so when a
 * second league later counts the same tournament this runs again with that
 * league's own mapping.
 *
 * Safe to retry — the resolver skips accounts that are already mapped.
 */
export default class MapIdentitiesJob extends Job<MapIdentitiesPayload> {
  static options: JobOptions = {
    queue: 'default',
    maxRetries: 3,
  }

  async execute() {
    await new IdentityResolverService().run({
      leagueId: this.payload.leagueId,
      eventId: this.payload.eventId,
    })

    /**
     * New results invalidate standings. Rankings are flagged rather than
     * recomputed, because an admin should review identity matches before results
     * move publicly — only rankings set to `auto` recompute straight away.
     */
    const auto = await new StalenessService().markLeagueStale(this.payload.leagueId, {
      tournamentsAdded: 1,
    })

    for (const rankingId of auto) {
      await RecomputeRankingJob.dispatch({ rankingId })
    }
  }
}
