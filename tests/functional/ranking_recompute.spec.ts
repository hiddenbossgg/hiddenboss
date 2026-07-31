import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import EventImport from '#models/event_import'
import League from '#models/league'
import LeaguePlayer from '#models/league_player'
import Ranking from '#models/ranking'
import RankingSetDelta from '#models/ranking_set_delta'
import RankingTournamentStanding from '#models/ranking_tournament_standing'
import RankingStanding from '#models/ranking_standing'
import { IdentityResolverService } from '#services/identity/identity_resolver_service'
import { SetSelectionService } from '#services/rankings/set_selection_service'
import { RankingRecomputerService } from '#services/rankings/ranking_recomputer_service'
import { StalenessService } from '#services/rankings/staleness_service'
import Tournament from '#models/tournament'
import { EventImporterService } from '#services/imports/event_importer_service'

/**
 * Truncates rather than wrapping in a transaction: the importer takes a
 * Postgres advisory lock released only at top-level commit, so a second import
 * inside one test would block on its own lock.
 */
test.group('ranking recompute', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  async function seedLeague(slug: string) {
    return League.create({ slug, name: slug })
  }

  /**
   * `startAt` matters: set deltas and tournament standings are plotted against
   * time, so an import with no date produces no chart data at all.
   */
  async function importWeekly(
    league: League,
    slug: string,
    entrants: string,
    sets: string,
    startAt = '2026-01-10'
  ): Promise<void> {
    const tournamentImport = await EventImport.create({
      leagueId: league.id,
      platformKey: 'manual',
      status: 'queued',
      payload: { name: slug, slug, entrants, sets, startAt },
    })

    const finished = await new EventImporterService().run({
      eventImportId: tournamentImport.id,
    })
    await new IdentityResolverService().run({
      leagueId: league.id,
      eventId: finished.eventId!,
    })
  }

  async function makeRanking(league: League, overrides: Partial<Ranking> = {}) {
    return Ranking.create({
      leagueId: league.id,
      slug: 'power-ranking',
      name: 'Power Ranking',
      algorithm: 'elo',
      recomputeMode: 'manual',
      published: true,
      ...overrides,
    })
  }

  const ENTRANTS = 'name\nAlice\nBob\nCarol\n'
  // Alice beats Bob, Bob beats Carol, Alice beats Carol.
  const SETS =
    'entrant_a,entrant_b,score_a,score_b\nAlice,Bob,3,1\nBob,Carol,3,0\nAlice,Carol,3,0\n'

  test('produces standings ordered by rating', async ({ assert }) => {
    const league = await seedLeague('recompute')
    await importWeekly(league, 'week-1', ENTRANTS, SETS)
    const ranking = await makeRanking(league)

    const { recompute } = await new RankingRecomputerService().run(ranking.id)

    const standings = await RankingStanding.query()
      .where('rankingRecomputeId', recompute.id)
      .preload('leaguePlayer')
      .orderBy('rank')

    assert.lengthOf(standings, 3)
    assert.deepEqual(
      standings.map((standing) => standing.leaguePlayer.displayTag),
      ['Alice', 'Bob', 'Carol']
    )
    assert.equal(standings[0].rank, 1)
    assert.isAbove(Number(standings[0].value), Number(standings[1].value))
  })

  test('records wins and losses', async ({ assert }) => {
    const league = await seedLeague('records')
    await importWeekly(league, 'week-1', ENTRANTS, SETS)
    const ranking = await makeRanking(league)

    const { recompute } = await new RankingRecomputerService().run(ranking.id)
    const standings = await RankingStanding.query()
      .where('rankingRecomputeId', recompute.id)
      .preload('leaguePlayer')

    const alice = standings.find((s) => s.leaguePlayer.displayTag === 'Alice')!
    const carol = standings.find((s) => s.leaguePlayer.displayTag === 'Carol')!

    assert.equal(alice.wins, 2)
    assert.equal(alice.losses, 0)
    assert.equal(carol.wins, 0)
    assert.equal(carol.losses, 2)
  })

  test('points the ranking at its newest recompute', async ({ assert }) => {
    const league = await seedLeague('latest')
    await importWeekly(league, 'week-1', ENTRANTS, SETS)
    const ranking = await makeRanking(league)

    const { recompute } = await new RankingRecomputerService().run(ranking.id)
    const reloaded = await Ranking.findOrFail(ranking.id)

    assert.equal(reloaded.latestRecomputeId, recompute.id)
  })

  test('skips a recompute when nothing changed', async ({ assert }) => {
    const league = await seedLeague('unchanged')
    await importWeekly(league, 'week-1', ENTRANTS, SETS)
    const ranking = await makeRanking(league)

    const first = await new RankingRecomputerService().run(ranking.id)
    const second = await new RankingRecomputerService().run(ranking.id)

    assert.isFalse(first.skipped)
    assert.isTrue(second.skipped)
    assert.equal(second.recompute.id, first.recompute.id)
  })

  /**
   * The fingerprint includes the league's identity version, so a merge
   * invalidates the previous recompute even though no set changed.
   */
  test('recomputes after an identity change even though sets are identical', async ({ assert }) => {
    const league = await seedLeague('identity-change')
    await importWeekly(league, 'week-1', ENTRANTS, SETS)
    const ranking = await makeRanking(league)

    const first = await new RankingRecomputerService().run(ranking.id)

    await League.query().where('id', league.id).increment('identity_version', 1)

    const second = await new RankingRecomputerService().run(ranking.id)
    assert.isFalse(second.skipped)
    assert.notEqual(second.recompute.id, first.recompute.id)
  })

  test('credits a merged player with their old sets', async ({ assert }) => {
    const league = await seedLeague('merged')
    await importWeekly(league, 'week-1', ENTRANTS, SETS)

    const alice = await LeaguePlayer.findByOrFail('displayTag', 'Alice')
    const bob = await LeaguePlayer.findByOrFail('displayTag', 'Bob')

    // Bob turns out to be Alice; credit must follow the merge target.
    bob.mergedIntoId = alice.id
    await bob.save()

    const ranking = await makeRanking(league)
    const { recompute } = await new RankingRecomputerService().run(ranking.id)

    const standings = await RankingStanding.query().where('rankingRecomputeId', recompute.id)
    const players = standings.map((standing) => standing.leaguePlayerId)

    assert.notInclude(players, bob.id)
    assert.include(players, alice.id)
  })

  test('excludes tournaments outside the ranking window', async ({ assert }) => {
    const league = await seedLeague('windowed')
    await importWeekly(league, 'week-1', ENTRANTS, SETS)

    // The manual adapter records no start date, so a window excludes everything.
    const ranking = await makeRanking(league, {
      startsAt: DateTime.fromISO('2030-01-01'),
      endsAt: DateTime.fromISO('2030-12-31'),
    })

    const { recompute } = await new RankingRecomputerService().run(ranking.id)
    assert.equal(recompute.playerCount, 0)
  })

  test('clears the stale flag once recomputed', async ({ assert }) => {
    const league = await seedLeague('stale-clear')
    await importWeekly(league, 'week-1', ENTRANTS, SETS)
    const ranking = await makeRanking(league)

    await new StalenessService().request(ranking.id)
    const flagged = await Ranking.findOrFail(ranking.id)
    assert.isNotNull(flagged.recomputeRequestedAt)

    await new RankingRecomputerService().run(ranking.id)
    const recomputed = await Ranking.findOrFail(ranking.id)
    assert.isNull(recomputed.recomputeRequestedAt)
  })

  /**
   * The most important test here.
   *
   * A recompute requested while one is already running must not be dropped.
   * Queue-level deduplication alone loses it, and the standings then stay
   * wrong until something unrelated triggers another recompute.
   */
  test('re-queues a recompute requested mid-recompute', async ({ assert }) => {
    const league = await seedLeague('concurrent')
    await importWeekly(league, 'week-1', ENTRANTS, SETS)
    const ranking = await makeRanking(league)

    /**
     * Fires the request from inside match selection, which is after the
     * recompute captured its start time and before it wrote anything — exactly
     * the window where a naive implementation loses it.
     */
    class InterleavingSelectionService extends SetSelectionService {
      override async forRanking(target: Ranking) {
        const matches = await super.forRanking(target)
        await new StalenessService().request(target.id)
        return matches
      }
    }

    const result = await new RankingRecomputerService({
      selection: new InterleavingSelectionService(),
    }).run(ranking.id)

    assert.isTrue(result.requeued, 'the mid-recompute request was silently dropped')

    // Still flagged, so the follow-up recompute will actually happen.
    const after = await Ranking.findOrFail(ranking.id)
    assert.isNotNull(after.recomputeRequestedAt)
  })

  /**
   * The Move column compares against the previous recompute, so it needs two
   * recomputes with genuinely different orders to mean anything. The first has
   * no previous, which is what `new` represents.
   */
  test('records rank delta between recomputes', async ({ assert }) => {
    const league = await seedLeague('rank-delta')

    // Carol loses everything, so she finishes last.
    await importWeekly(
      league,
      'week-1',
      ENTRANTS,
      'entrant_a,entrant_b,score_a,score_b\nAlice,Carol,3,0\nBob,Carol,3,0\n'
    )
    const ranking = await makeRanking(league)

    const first = await new RankingRecomputerService().run(ranking.id)
    const firstStandings = await RankingStanding.query()
      .where('rankingRecomputeId', first.recompute.id)
      .preload('leaguePlayer')
      .orderBy('rank')

    // Nothing to compare against on a first build.
    assert.isTrue(firstStandings.every((standing) => standing.previousRank === null))
    const carolFirst = firstStandings.find((s) => s.leaguePlayer.displayTag === 'Carol')!

    // Carol now beats both of them, which should move her up.
    await importWeekly(
      league,
      'week-2',
      ENTRANTS,
      'entrant_a,entrant_b,score_a,score_b\nCarol,Alice,3,0\nCarol,Bob,3,0\n'
    )

    const second = await new RankingRecomputerService().run(ranking.id)
    assert.isFalse(second.skipped)

    const secondStandings = await RankingStanding.query()
      .where('rankingRecomputeId', second.recompute.id)
      .preload('leaguePlayer')
      .orderBy('rank')

    const carolSecond = secondStandings.find((s) => s.leaguePlayer.displayTag === 'Carol')!

    assert.equal(carolSecond.previousRank, carolFirst.rank)
    assert.isBelow(carolSecond.rank, carolFirst.rank, 'Carol should have climbed')
  })

  /**
   * Two grains: per-set rating deltas, and per-tournament rank and rating
   * standings for plotting against time.
   */
  test('records why each rating moved', async ({ assert }) => {
    const league = await seedLeague('deltas')
    await importWeekly(league, 'week-1', ENTRANTS, SETS)
    const ranking = await makeRanking(league)

    await new RankingRecomputerService().run(ranking.id)

    const deltas = await RankingSetDelta.query()
      .where('rankingId', ranking.id)
      .preload('leaguePlayer')

    // Three rated sets, two players each.
    assert.lengthOf(deltas, 6)

    for (const entry of deltas) {
      const delta = Number(entry.valueAfter) - Number(entry.valueBefore)
      assert.closeTo(Number(entry.delta), delta, 0.0001)
      assert.isNotNull(entry.setId, 'each delta points at the set that caused it')
    }

    // Alice won everything, so all of her deltas are gains.
    const alice = deltas.filter((entry) => entry.leaguePlayer.displayTag === 'Alice')
    assert.lengthOf(alice, 2)
    assert.isTrue(alice.every((entry) => Number(entry.delta) > 0))
  })

  test('tournamentStandings rank and rating at each tournament', async ({ assert }) => {
    const league = await seedLeague('tournamentStandings')
    await importWeekly(league, 'week-1', ENTRANTS, SETS, '2026-01-10')
    await importWeekly(league, 'week-2', ENTRANTS, SETS, '2026-01-17')
    const ranking = await makeRanking(league)

    await new RankingRecomputerService().run(ranking.id)

    const tournamentStandings = await RankingTournamentStanding.query()
      .where('rankingId', ranking.id)
      .preload('leaguePlayer')
      .orderBy('occurredAt')

    // One row per player per tournament: 3 players across 2 tournaments.
    assert.lengthOf(tournamentStandings, 6)

    const tournaments = new Set(
      tournamentStandings.map((tournamentStanding) => tournamentStanding.tournamentId)
    )
    assert.lengthOf([...tournaments], 2)

    // Ranks within a tournamentStanding are a dense 1..n, which is what a chart needs.
    for (const tournamentId of tournaments) {
      const ranks = tournamentStandings
        .filter((tournamentStanding) => tournamentStanding.tournamentId === tournamentId)
        .map((tournamentStanding) => tournamentStanding.rank)
        .sort()
      assert.deepEqual(ranks, [1, 2, 3])
    }

    // Every point is plottable against time.
    assert.isTrue(
      tournamentStandings.every((tournamentStanding) => tournamentStanding.occurredAt !== null)
    )
  })

  /**
   * Appending a tournament cannot change any rating that preceded it, so the
   * earlier rows must be left completely alone — not deleted and rewritten with
   * identical values. Comparing row ids is what distinguishes the two: values
   * would match either way.
   */
  test('leaves earlier tournaments untouched when appending', async ({ assert }) => {
    const league = await seedLeague('incremental')
    await importWeekly(league, 'week-1', ENTRANTS, SETS, '2026-01-10')
    const ranking = await makeRanking(league)

    await new RankingRecomputerService().run(ranking.id)

    const week1 = await Tournament.findByOrFail('slug', 'week-1')
    const idsBeforeRows = await RankingTournamentStanding.query()
      .where('rankingId', ranking.id)
      .where('tournamentId', week1.id)
      .orderBy('rank')
    const idsBefore = idsBeforeRows.map((row) => row.id)

    await importWeekly(league, 'week-2', ENTRANTS, SETS, '2026-01-17')
    await new RankingRecomputerService().run(ranking.id)

    const idsAfterRows = await RankingTournamentStanding.query()
      .where('rankingId', ranking.id)
      .where('tournamentId', week1.id)
      .orderBy('rank')
    const idsAfter = idsAfterRows.map((row) => row.id)

    assert.deepEqual(idsAfter, idsBefore, 'week 1 rows were rewritten unnecessarily')
  })

  /**
   * With rows keyed by ranking rather than by recompute, repeated recomputes
   * must not accumulate copies.
   */
  test('storage stays flat across repeated recomputes', async ({ assert }) => {
    const league = await seedLeague('flat')
    await importWeekly(league, 'week-1', ENTRANTS, SETS, '2026-01-10')
    const ranking = await makeRanking(league)
    await new RankingRecomputerService().run(ranking.id)

    const count = async () => {
      const deltas = await RankingSetDelta.query().where('rankingId', ranking.id)
      const tournamentStandings = await RankingTournamentStanding.query().where(
        'rankingId',
        ranking.id
      )
      return { deltas: deltas.length, tournamentStandings: tournamentStandings.length }
    }

    const before = await count()

    // Force three genuine recomputes without adding any matches.
    for (let index = 0; index < 3; index += 1) {
      await League.query().where('id', league.id).increment('identity_version', 1)
      await new RankingRecomputerService().run(ranking.id)
    }

    assert.deepEqual(await count(), before)
  })

  /**
   * A retroactive change must rewrite the affected tournaments rather than
   * leaving stale rows behind.
   */
  test('rewrites earlier tournaments when something retroactive changes', async ({ assert }) => {
    const league = await seedLeague('retroactive')
    await importWeekly(league, 'week-1', ENTRANTS, SETS, '2026-01-10')
    const ranking = await makeRanking(league)
    await new RankingRecomputerService().run(ranking.id)

    const week1 = await Tournament.findByOrFail('slug', 'week-1')
    const before = await RankingTournamentStanding.query()
      .where('rankingId', ranking.id)
      .where('tournamentId', week1.id)
    const idsBefore = before.map((row) => row.id)

    // Merging changes who the matches belong to, so the prefix hash moves.
    const alice = await LeaguePlayer.findByOrFail('displayTag', 'Alice')
    const bob = await LeaguePlayer.findByOrFail('displayTag', 'Bob')
    bob.mergedIntoId = alice.id
    await bob.save()
    await League.query().where('id', league.id).increment('identity_version', 1)

    await new RankingRecomputerService().run(ranking.id)

    const after = await RankingTournamentStanding.query()
      .where('rankingId', ranking.id)
      .where('tournamentId', week1.id)
    const idsAfter = after.map((row) => row.id)

    assert.notDeepEqual(idsAfter, idsBefore, 'stale rows survived a retroactive change')
  })

  /**
   * Values are path-dependent, so a player's deltas must chain in the order
   * their rows are timestamped: each `value_before` is the previous
   * `value_after`.
   */
  test('replays matches in chronological order', async ({ assert }) => {
    const league = await seedLeague('chronology')
    await importWeekly(league, 'week-1', ENTRANTS, SETS)
    const ranking = await makeRanking(league)

    await new RankingRecomputerService().run(ranking.id)

    const deltas = await RankingSetDelta.query()
      .where('rankingId', ranking.id)
      .preload('leaguePlayer')
      .orderBy('occurredAt')

    // For each player, walking the deltas forward in time must produce an
    // unbroken chain: every row's `before` is the previous row's `after`.
    const byPlayer = new Map<string, typeof deltas>()
    for (const entry of deltas) {
      const existing = byPlayer.get(entry.leaguePlayerId) ?? []
      existing.push(entry)
      byPlayer.set(entry.leaguePlayerId, existing)
    }

    for (const [, entries] of byPlayer) {
      for (let index = 1; index < entries.length; index += 1) {
        assert.closeTo(
          Number(entries[index].valueBefore),
          Number(entries[index - 1].valueAfter),
          0.0001,
          'rating chain must follow the order the deltas are timestamped in'
        )
      }
    }
  })

  test('marks every ranking in a league stale', async ({ assert }) => {
    const league = await seedLeague('bulk-stale')
    await makeRanking(league, { slug: 'a', name: 'A' })
    await makeRanking(league, { slug: 'b', name: 'B', recomputeMode: 'auto' })

    const auto = await new StalenessService().markLeagueStale(league.id, { tournamentsAdded: 1 })

    const rankings = await Ranking.query().where('leagueId', league.id)
    for (const ranking of rankings) {
      assert.isNotNull(ranking.recomputeRequestedAt)
      assert.equal(ranking.staleTournamentCount, 1)
    }

    // Only the auto ranking is handed back for immediate recomputing.
    assert.lengthOf(auto, 1)
  })
})
