import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import EventImport from '#models/event_import'
import League from '#models/league'
import Ranking from '#models/ranking'
import { IdentityResolverService } from '#services/identity/identity_resolver_service'
import { RankingRecomputerService } from '#services/rankings/ranking_recomputer_service'
import { EventImporterService } from '#services/imports/event_importer_service'

/**
 * Activity requirements are a read-time filter over standings that already
 * exist, not a recompute concern — coverage belongs here, against the
 * standings page, rather than in `ranking_recompute.spec.ts`.
 */
test.group('ranking activity filter', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  async function importWeekly(league: League, slug: string, entrants: string, sets: string) {
    const tournamentImport = await EventImport.create({
      leagueId: league.id,
      platformKey: 'manual',
      status: 'queued',
      payload: { name: slug, slug, entrants, sets, startAt: '2026-01-10' },
    })

    const finished = await new EventImporterService().run({ eventImportId: tournamentImport.id })
    await new IdentityResolverService().run({ leagueId: league.id, eventId: finished.eventId! })
  }

  /**
   * Alice and Bob play both weeklies; Carol only shows up once, so a
   * `{ count: 2 }` clause catches her and no one else. Week 1 has 4 entrants,
   * week 2 has 2, which is what the entrant-count clauses key off.
   */
  async function seedTwoWeeklies(slug: string) {
    const league = await League.create({ slug, name: slug, visibility: 'public' })

    await importWeekly(
      league,
      `${slug}-week-1`,
      'name\nAlice\nBob\nCarol\nDan\n',
      'entrant_a,entrant_b,score_a,score_b\nAlice,Bob,3,1\nBob,Carol,3,0\n'
    )
    await importWeekly(
      league,
      `${slug}-week-2`,
      'name\nAlice\nBob\n',
      'entrant_a,entrant_b,score_a,score_b\nAlice,Bob,3,2\n'
    )

    return league
  }

  async function standingsFor(client: any, league: League, ranking: Ranking) {
    const response = await client
      .get(`/${league.slug}/rankings/${ranking.slug}`)
      .header('X-Inertia', 'true')
      .header('X-Inertia-Version', '1')

    return response.body().props.standings as Array<{
      player: string
      inactive: boolean
    }>
  }

  test('drops players failing a requirement by default', async ({ client, assert }) => {
    const league = await seedTwoWeeklies('hide-default')
    const ranking = await Ranking.create({
      leagueId: league.id,
      slug: 'ranking',
      name: 'Ranking',
      algorithm: 'elo',
      recomputeMode: 'manual',
      activityRequirements: [{ count: 2, minEntrants: null }],
      published: true,
    })
    await new RankingRecomputerService().run(ranking.id)

    const standings = await standingsFor(client, league, ranking)

    assert.sameMembers(
      standings.map((standing) => standing.player),
      ['Alice', 'Bob']
    )
  })

  test('keeps and flags players failing a requirement when toggled on', async ({
    client,
    assert,
  }) => {
    const league = await seedTwoWeeklies('flag-toggle')
    const ranking = await Ranking.create({
      leagueId: league.id,
      slug: 'ranking',
      name: 'Ranking',
      algorithm: 'elo',
      recomputeMode: 'manual',
      activityRequirements: [{ count: 2, minEntrants: null }],
      flagInactive: true,
      published: true,
    })
    await new RankingRecomputerService().run(ranking.id)

    const standings = await standingsFor(client, league, ranking)

    assert.sameMembers(
      standings.map((standing) => standing.player),
      ['Alice', 'Bob', 'Carol']
    )

    const carol = standings.find((standing) => standing.player === 'Carol')!
    const bob = standings.find((standing) => standing.player === 'Bob')!
    assert.isTrue(carol.inactive)
    assert.isFalse(bob.inactive)
  })

  /**
   * Two independent clauses over the same played tournaments: at least one
   * tournament with 4+ entrants, and at least two tournaments of any size.
   * Alice and Bob clear both — week 1 has 4 entrants and there are two weeks
   * total. Carol only played the 4-entrant week, clearing the size clause
   * but not the count clause.
   */
  test('requires every clause to hold, evaluated independently', async ({ client, assert }) => {
    const league = await seedTwoWeeklies('combined-clauses')
    const ranking = await Ranking.create({
      leagueId: league.id,
      slug: 'ranking',
      name: 'Ranking',
      algorithm: 'elo',
      recomputeMode: 'manual',
      activityRequirements: [
        { count: 1, minEntrants: 4 },
        { count: 2, minEntrants: null },
      ],
      flagInactive: true,
      published: true,
    })
    await new RankingRecomputerService().run(ranking.id)

    const standings = await standingsFor(client, league, ranking)

    const byPlayer = new Map(standings.map((standing) => [standing.player, standing.inactive]))
    assert.isFalse(byPlayer.get('Alice'))
    assert.isFalse(byPlayer.get('Bob'))
    assert.isTrue(byPlayer.get('Carol'))
  })
})
