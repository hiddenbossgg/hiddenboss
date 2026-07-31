import { createHash } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import League from '#models/league'
import Ranking from '#models/ranking'
import RankingSetDelta from '#models/ranking_set_delta'
import RankingRecompute from '#models/ranking_recompute'
import RankingTournamentStanding from '#models/ranking_tournament_standing'
import RankingStanding from '#models/ranking_standing'
import { Elo } from '#lib/rankings/elo'
import { Glicko2 } from '#lib/rankings/glicko2'
import { OpenSkill } from '#lib/rankings/openskill'
import { SetSelectionService } from './set_selection_service.js'
import type { RatableSet, RankingAlgorithm, Standing } from '#lib/rankings/contracts'

export interface RecomputeResult {
  recompute: RankingRecompute
  /** True when nothing had changed and the previous recompute still stands. */
  skipped: boolean
  /** A recompute was requested mid-flight and needs running again. */
  requeued: boolean
}

/** One value delta, accumulated during replay and written in bulk. */
interface PendingSetDelta {
  leaguePlayerId: string
  setId: string
  tournamentId: string
  occurredAt: Date | null
  before: number
  after: number
}

interface PendingTournamentStanding {
  leaguePlayerId: string
  tournamentId: string
  occurredAt: Date
  rank: number
  value: number
}

/**
 * Recomputes a ranking by replaying its sets in order.
 *
 * Always a full replay: values are order-dependent, so patching one in place
 * would drift invisibly once a merge or correction changes earlier sets.
 */
export class RankingRecomputerService {
  private readonly selection: SetSelectionService

  /**
   * Injectable so tests can interleave a recompute request with the read, and so
   * per-league corrections can be layered in without changing this class.
   */
  constructor(options: { selection?: SetSelectionService } = {}) {
    this.selection = options.selection ?? new SetSelectionService()
  }

  async run(rankingId: string): Promise<RecomputeResult> {
    const ranking = await Ranking.findOrFail(rankingId)
    const league = await League.findOrFail(ranking.leagueId)

    /**
     * Captured before anything is read. A request arriving mid-flight moves
     * `recomputeRequestedAt` past this, and is re-queued at the end rather than
     * being lost — queue deduplication alone cannot detect it.
     */
    const startedAt = DateTime.now()

    const sets = await this.selection.forRanking(ranking)
    const fingerprint = this.fingerprint(ranking, league, sets)

    /** Captured before anything is written, so rank deltas compare correctly. */
    const previousRecomputeId = ranking.latestRecomputeId

    const latest = previousRecomputeId ? await RankingRecompute.find(previousRecomputeId) : null
    if (latest?.status === 'ok' && latest.inputFingerprint === fingerprint) {
      const requeued = await this.settle(ranking, startedAt)
      return { recompute: latest, skipped: true, requeued }
    }

    /**
     * Recorded as `running` before the replay starts, so a page watching this
     * ranking can tell work is in flight. The row is only pointed at by
     * `latest_recompute_id` once it is complete, so readers never see it.
     */
    const recompute = await RankingRecompute.create({
      rankingId: ranking.id,
      status: 'running',
      inputFingerprint: fingerprint,
      startedAt,
    })

    try {
      return await this.replayInto(recompute, {
        ranking,
        league,
        sets,
        fingerprint,
        startedAt,
        previousRecomputeId,
      })
    } catch (error) {
      recompute.status = 'failed'
      recompute.finishedAt = DateTime.now()
      await recompute.save()
      throw error
    }
  }

  private async replayInto(
    recompute: RankingRecompute,
    context: {
      ranking: Ranking
      league: League
      sets: RatableSet[]
      fingerprint: string
      startedAt: DateTime
      previousRecomputeId: string | null
    }
  ): Promise<RecomputeResult> {
    const { ranking, league, sets, startedAt, previousRecomputeId } = context

    const replay = this.replay(this.algorithmFor(ranking), sets)
    const { state, algorithm, setDeltas, tournamentStandings, tournamentHashes, rated } = replay

    /**
     * A tournament's rows are valid while its replay prefix is unchanged, so
     * only tournaments whose hash moved need rewriting.
     */
    const stored = (ranking.tournamentHashes ?? {}) as Record<string, string>
    const changedTournaments = new Set(
      [...tournamentHashes.entries()]
        .filter(([tournamentId, hash]) => stored[tournamentId] !== hash)
        .map(([tournamentId]) => tournamentId)
    )
    const goneTournaments = Object.keys(stored).filter((id) => !tournamentHashes.has(id))

    const standings = algorithm.finalize(state)
    const lastPlayed = this.lastPlayedAt(sets)

    const created = await db.transaction(async (trx) => {
      recompute.useTransaction(trx)
      recompute.merge({
        status: 'ok',
        watermarkAt: this.watermark(sets),
        algorithmState: algorithm.serialize(state) as Record<string, any>,
        setCount: rated,
        playerCount: standings.length,
        identityVersion: league.identityVersion,
        correctionsVersion: league.correctionsVersion,
        finishedAt: DateTime.now(),
      })
      await recompute.save()

      await this.writeStandings(trx, recompute, standings, lastPlayed, previousRecomputeId)
      await this.writeSetDeltas(trx, ranking.id, setDeltas, changedTournaments, goneTournaments)
      await this.writeTournamentStandings(
        trx,
        ranking.id,
        tournamentStandings,
        changedTournaments,
        goneTournaments
      )

      /**
       * Repointed last, so readers see the previous recompute's complete
       * standings rather than a half-written table.
       */
      await Ranking.query({ client: trx })
        .where('id', ranking.id)
        .update({
          latest_recompute_id: recompute.id,
          stale_tournament_count: 0,
          // Written in the same transaction as the rows they describe, so the
          // hashes can never claim rows exist that do not.
          tournament_hashes: Object.fromEntries(tournamentHashes),
        })

      return recompute
    })

    const requeued = await this.settle(ranking, startedAt)
    return { recompute: created, skipped: false, requeued }
  }

  private async writeStandings(
    trx: any,
    recompute: RankingRecompute,
    standings: Standing[],
    lastPlayed: Map<string, Date>,
    previousRecomputeId: string | null
  ): Promise<void> {
    if (standings.length === 0) return

    const previous = await this.previousRanks(trx, previousRecomputeId)

    await RankingStanding.createMany(
      standings.map((standing, index) => ({
        rankingRecomputeId: recompute.id,
        leaguePlayerId: standing.leaguePlayerId,
        rank: index + 1,
        previousRank: previous.get(standing.leaguePlayerId) ?? null,
        value: standing.value.toFixed(4),
        deviation: standing.deviation === null ? null : standing.deviation.toFixed(4),
        volatility: standing.volatility === null ? null : standing.volatility.toFixed(6),
        wins: standing.wins,
        losses: standing.losses,
        setsPlayed: standing.setsPlayed,
        eventsCounted: 0,
        lastPlayedAt: lastPlayed.has(standing.leaguePlayerId)
          ? DateTime.fromJSDate(lastPlayed.get(standing.leaguePlayerId)!)
          : null,
      })),
      { client: trx }
    )
  }

  /**
   * Replays every set, collecting what needs persisting. The replay is always
   * complete; only the writing is incremental, via a per-tournament hash of the
   * sets replayed up to that point.
   */
  private replay(algorithm: RankingAlgorithm<any>, sets: RatableSet[]) {
    const state = algorithm.init()
    const setDeltas: PendingSetDelta[] = []
    const tournamentStandings: PendingTournamentStanding[] = []
    const tournamentHashes = new Map<string, string>()

    let running = createHash('sha256')
    let currentTournamentId: string | null = null
    let rated = 0

    const closeTournament = (tournamentId: string) => {
      const occurredAt = sets.find((set) => set.tournamentId === tournamentId)?.tournamentStartAt

      // Undated tournaments cannot be plotted, so they get no standing rather
      // than an invented date.
      if (occurredAt) {
        algorithm.finalize(state).forEach((standing, index) => {
          tournamentStandings.push({
            leaguePlayerId: standing.leaguePlayerId,
            tournamentId,
            occurredAt,
            rank: index + 1,
            value: standing.value,
          })
        })
      }

      // `copy()` so the running hash keeps accumulating for later tournaments.
      tournamentHashes.set(tournamentId, running.copy().digest('hex'))
    }

    for (const set of sets) {
      if (currentTournamentId !== null && set.tournamentId !== currentTournamentId) {
        closeTournament(currentTournamentId)
      }
      currentTournamentId = set.tournamentId

      running.update(`${set.setId}:${set.sideA.join(',')}:${set.sideB.join(',')}:${set.winner}`)

      const changes = algorithm.applySet(state, set)
      if (changes.length === 0) continue

      rated += 1

      for (const change of changes) {
        setDeltas.push({
          leaguePlayerId: change.leaguePlayerId,
          setId: set.setId,
          tournamentId: set.tournamentId,
          occurredAt: set.occurredAt ?? set.tournamentStartAt,
          before: change.before,
          after: change.after,
        })
      }
    }

    // The final tournament has no successor to close it.
    if (currentTournamentId !== null) {
      closeTournament(currentTournamentId)
    }

    return { state, algorithm, setDeltas, tournamentStandings, tournamentHashes, rated }
  }

  /**
   * Writes only the tournaments whose replay prefix changed, and removes any
   * whose sets have gone.
   */
  private async writeSetDeltas(
    trx: any,
    rankingId: string,
    setDeltas: PendingSetDelta[],
    changed: Set<string>,
    gone: string[]
  ): Promise<void> {
    const stale = [...changed, ...gone]
    if (stale.length > 0) {
      await RankingSetDelta.query({ client: trx })
        .where('rankingId', rankingId)
        .whereIn('tournamentId', stale)
        .delete()
    }

    const rows = setDeltas.filter(
      (setDelta) => setDelta.occurredAt !== null && changed.has(setDelta.tournamentId)
    )
    if (rows.length === 0) return

    await RankingSetDelta.createMany(
      rows.map((setDelta) => ({
        rankingId,
        leaguePlayerId: setDelta.leaguePlayerId,
        setId: setDelta.setId,
        tournamentId: setDelta.tournamentId,
        occurredAt: DateTime.fromJSDate(setDelta.occurredAt!),
        valueBefore: setDelta.before.toFixed(4),
        valueAfter: setDelta.after.toFixed(4),
        delta: (setDelta.after - setDelta.before).toFixed(4),
      })),
      { client: trx }
    )
  }

  private async writeTournamentStandings(
    trx: any,
    rankingId: string,
    standings: PendingTournamentStanding[],
    changed: Set<string>,
    gone: string[]
  ): Promise<void> {
    const stale = [...changed, ...gone]
    if (stale.length > 0) {
      await RankingTournamentStanding.query({ client: trx })
        .where('rankingId', rankingId)
        .whereIn('tournamentId', stale)
        .delete()
    }

    const rows = standings.filter((standing) => changed.has(standing.tournamentId))
    if (rows.length === 0) return

    await RankingTournamentStanding.createMany(
      rows.map((standing) => ({
        rankingId,
        leaguePlayerId: standing.leaguePlayerId,
        tournamentId: standing.tournamentId,
        occurredAt: DateTime.fromJSDate(standing.occurredAt),
        rank: standing.rank,
        value: standing.value.toFixed(4),
      })),
      { client: trx }
    )
  }

  /**
   * Where each player sat in the previous recompute, for the rank delta column.
   *
   * The id is passed in rather than read from `latest_recompute_id`, which by
   * this point may already point at the recompute being written.
   */
  private async previousRanks(
    trx: any,
    previousRecomputeId: string | null
  ): Promise<Map<string, number>> {
    if (!previousRecomputeId) return new Map()

    const rows = await RankingStanding.query({ client: trx })
      .where('rankingRecomputeId', previousRecomputeId)
      .select('leaguePlayerId', 'rank')

    return new Map(rows.map((row) => [row.leaguePlayerId, row.rank]))
  }

  /**
   * Re-queues when a recompute was requested while this one was running, and
   * otherwise clears the stale flag.
   */
  private async settle(ranking: Ranking, startedAt: DateTime): Promise<boolean> {
    const current = await Ranking.findOrFail(ranking.id)
    const requestedAt = current.recomputeRequestedAt

    if (requestedAt && requestedAt > startedAt) {
      return true
    }

    await Ranking.query()
      .where('id', ranking.id)
      .update({ recompute_requested_at: null, stale_tournament_count: 0 })

    return false
  }

  /**
   * Identifies the inputs. Includes the league's identity and corrections
   * versions, so a merge invalidates the recompute even though the sets did not
   * change.
   */
  private fingerprint(ranking: Ranking, league: League, sets: RatableSet[]): string {
    const hash = createHash('sha256')

    hash.update(ranking.algorithm)
    hash.update(JSON.stringify(ranking.config ?? {}))
    hash.update(JSON.stringify(ranking.requirements ?? {}))
    hash.update(String(league.identityVersion))
    hash.update(String(league.correctionsVersion))

    for (const set of sets) {
      hash.update(`${set.setId}:${set.sideA.join(',')}:${set.sideB.join(',')}:${set.winner}`)
    }

    return hash.digest('hex')
  }

  private watermark(sets: RatableSet[]): DateTime | null {
    const times = sets.map((set) => set.occurredAt).filter((value): value is Date => value !== null)

    if (times.length === 0) return null

    return DateTime.fromJSDate(new Date(Math.max(...times.map((time) => time.getTime()))))
  }

  /** Drives read-time activity filtering. */
  private lastPlayedAt(sets: RatableSet[]): Map<string, Date> {
    const seen = new Map<string, Date>()

    for (const set of sets) {
      if (!set.occurredAt) continue

      for (const playerId of [...set.sideA, ...set.sideB]) {
        const existing = seen.get(playerId)
        if (!existing || set.occurredAt > existing) {
          seen.set(playerId, set.occurredAt)
        }
      }
    }

    return seen
  }

  private algorithmFor(ranking: Ranking): RankingAlgorithm<any> {
    switch (ranking.algorithm) {
      case 'elo':
        return new Elo(ranking.config ?? {})
      case 'glicko2':
        return new Glicko2(ranking.config ?? {})
      case 'openskill':
        return new OpenSkill(ranking.config ?? {})
      default:
        throw new Error(
          `Ranking "${ranking.slug}" uses algorithm "${ranking.algorithm}", which is not implemented yet`
        )
    }
  }
}
