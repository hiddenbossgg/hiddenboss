import { Job } from '@adonisjs/queue'
import { DateTime } from 'luxon'
import Ranking from '#models/ranking'
import RankingRecompute from '#models/ranking_recompute'
import { RankingRecomputerService } from '#services/rankings/ranking_recomputer_service'
import type { JobOptions } from '@adonisjs/queue/types'

type RecomputeRankingPayload = {
  rankingId: string
  /** Passed straight through to `RankingRecomputerService#run` — see its own doc for when this is warranted. */
  force?: boolean
}

/**
 * Recomputes one ranking's standings.
 *
 * Thin over RankingRecomputerService, which is also callable directly so a recompute can
 * be run and inspected without a worker.
 */
export default class RecomputeRankingJob extends Job<RecomputeRankingPayload> {
  static options: JobOptions = {
    queue: 'default',
    maxRetries: 3,
  }

  async execute() {
    const result = await new RankingRecomputerService().run(this.payload.rankingId, {
      force: this.payload.force,
    })

    /**
     * A request that arrived mid-recompute is not lost: the recomputer reports it
     * and we queue the follow-up here rather than leaving standings stale.
     */
    if (result.requeued) {
      await RecomputeRankingJob.dispatch({ rankingId: this.payload.rankingId })
    }
  }

  /**
   * A failed recompute must be visible, not just absent from the logs.
   *
   * The recomputer marks its own row `failed` with the thrown error, so that row
   * is left as the record. The queue only hands us `E_JOB_MAX_ATTEMPTS_REACHED`,
   * which names no cause, so writing another row from it would bury the real one
   * behind a message that explains nothing.
   */
  async failed(error: Error) {
    const ranking = await Ranking.find(this.payload.rankingId)
    if (!ranking) return

    const recorded = await RankingRecompute.query()
      .where('rankingId', ranking.id)
      .whereIn('status', ['failed', 'running'])
      .orderBy('startedAt', 'desc')
      .first()

    if (recorded) {
      /** Left `running` if the process died mid-replay, which nothing else clears. */
      recorded.status = 'failed'
      recorded.error = recorded.error ?? error.message
      recorded.finishedAt = DateTime.now()
      await recorded.save()
      return
    }

    await RankingRecompute.create({
      rankingId: ranking.id,
      status: 'failed',
      error: error.message,
      startedAt: DateTime.now(),
      finishedAt: DateTime.now(),
    })
  }
}
