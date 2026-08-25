import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import EventImport from '#models/event_import'
import Event from '#models/event'
import League from '#models/league'
import Ranking from '#models/ranking'
import Tournament from '#models/tournament'
import { IdentityResolverService } from '#services/identity/identity_resolver_service'
import { EventImporterService } from '#services/imports/event_importer_service'
import { RankingRecomputerService } from '#services/rankings/ranking_recomputer_service'

/**
 * `SetSelectionService` reanchors a ranking's `startsAt`/`endsAt` against its
 * league's time zone on every recompute, rather than comparing the stored
 * instant against a UTC-implied bound — the same evening-tournament problem
 * tournament dates had, just for the ranking's own window instead of the
 * page display.
 */
test.group('ranking date range time zone', (group) => {
  /**
   * Truncates rather than wrapping in a transaction: the importer takes a
   * Postgres advisory lock released only at top-level commit.
   */
  group.each.setup(() => testUtils.db().truncate())

  async function seedLeague(slug: string, timezone: string | null = null) {
    return League.create({ slug, name: slug, timezone })
  }

  const ENTRANTS = 'name\nAlice\nBob\n'
  const SETS = 'entrant_a,entrant_b,score_a,score_b\nAlice,Bob,3,1\n'

  /**
   * Imports via the manual adapter for its entrant/set/identity-resolution
   * plumbing, then overwrites the resulting tournament's start instant
   * directly — the adapter's CSV payload only carries a plain date, with no
   * time-of-day precision to place it near a boundary.
   */
  async function importAt(league: League, slug: string, instant: string): Promise<Tournament> {
    const eventImport = await EventImport.create({
      leagueId: league.id,
      platformKey: 'manual',
      status: 'queued',
      payload: { name: slug, slug, entrants: ENTRANTS, sets: SETS, startAt: '2026-01-01' },
    })

    const finished = await new EventImporterService().run({ eventImportId: eventImport.id })
    await new IdentityResolverService().run({ leagueId: league.id, eventId: finished.eventId! })

    const event = await Event.findOrFail(finished.eventId!)
    const tournament = await Tournament.findOrFail(event.tournamentId)
    tournament.startAt = DateTime.fromISO(instant)
    await tournament.save()
    return tournament
  }

  async function makeRanking(league: League, overrides: Partial<Ranking> = {}) {
    return Ranking.create({
      leagueId: league.id,
      slug: 'ranking',
      name: 'Ranking',
      algorithm: 'elo',
      recomputeMode: 'manual',
      published: true,
      ...overrides,
    })
  }

  test("counts a tournament through the league's own local day, not UTC's", async ({ assert }) => {
    const league = await seedLeague('tz-window-la', 'America/Los_Angeles')
    // 6pm PDT June 30 — already rolled into July 1st in UTC.
    await importAt(league, 'evening-local', '2026-07-01T01:00:00Z')
    const ranking = await makeRanking(league, { endsAt: DateTime.fromISO('2026-06-30') })

    const { recompute } = await new RankingRecomputerService().run(ranking.id)

    assert.isAbove(
      recompute.playerCount,
      0,
      "the league's own June 30 hadn't ended yet at that instant"
    )
  })

  test('the identical instant falls outside the window for a UTC league', async ({ assert }) => {
    const league = await seedLeague('tz-window-utc')
    await importAt(league, 'evening-local', '2026-07-01T01:00:00Z')
    const ranking = await makeRanking(league, { endsAt: DateTime.fromISO('2026-06-30') })

    const { recompute } = await new RankingRecomputerService().run(ranking.id)

    assert.equal(recompute.playerCount, 0, 'July 1st UTC is past a UTC-anchored June 30 cutoff')
  })
})
