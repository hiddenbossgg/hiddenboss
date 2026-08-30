import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import EventImport from '#models/event_import'
import League from '#models/league'
import Ranking from '#models/ranking'
import { IdentityResolverService } from '#services/identity/identity_resolver_service'
import { RankingRecomputerService } from '#services/rankings/ranking_recomputer_service'
import { EventImporterService } from '#services/imports/event_importer_service'

/**
 * The H2H page orders players by rating and marks who is inactive, both read
 * against the league's default ranking — same source `PlayersController` and
 * `RankingsController` already read, just never dropped: unlike the rankings
 * page, an inactive player still gets a row/column here, since excluding them
 * is a page-side toggle rather than a server-side default.
 */
test.group('h2h', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  async function importWeekly(league: League, slug: string, entrants: string, sets: string) {
    const eventImport = await EventImport.create({
      leagueId: league.id,
      platformKey: 'manual',
      status: 'queued',
      payload: { name: slug, slug, entrants, sets, startAt: '2026-01-10' },
    })

    const finished = await new EventImporterService().run({ eventImportId: eventImport.id })
    await new IdentityResolverService().run({ leagueId: league.id, eventId: finished.eventId! })
  }

  async function h2hProps(client: any, league: League, query: Record<string, string> = {}) {
    const response = await client
      .get(`/${league.slug}/h2h`)
      .qs(query)
      .header('X-Inertia', 'true')
      .header('X-Inertia-Version', '1')

    return response.body().props as {
      ranking: { slug: string; name: string } | null
      rankings: Array<{ slug: string; name: string }>
      players: Array<{
        displayTag: string
        rank: number | null
        rating: number | null
        inactive: boolean
      }>
    }
  }

  async function h2hPlayers(client: any, league: League) {
    const props = await h2hProps(client, league)
    return props.players
  }

  test('orders players by rating, best first', async ({ client, assert }) => {
    const league = await League.create({
      slug: 'h2h-order',
      name: 'h2h-order',
      visibility: 'public',
    })

    // Alice beats everyone, Bob beats only Carol, Carol loses every set.
    await importWeekly(
      league,
      'h2h-order-week-1',
      'name\nAlice\nBob\nCarol\n',
      `entrant_a,entrant_b,winner
Alice,Bob,Alice
Alice,Carol,Alice
Bob,Carol,Bob
`
    )

    const ranking = await Ranking.create({
      leagueId: league.id,
      slug: 'ranking',
      name: 'Ranking',
      algorithm: 'elo',
      recomputeMode: 'manual',
      published: true,
    })
    await new RankingRecomputerService().run(ranking.id)

    const players = await h2hPlayers(client, league)

    assert.deepEqual(
      players.map((player) => player.displayTag),
      ['Alice', 'Bob', 'Carol']
    )
    assert.deepEqual(
      players.map((player) => player.rank),
      [1, 2, 3]
    )
  })

  test('flags inactive players without dropping them from the table', async ({
    client,
    assert,
  }) => {
    const league = await League.create({
      slug: 'h2h-inactive',
      name: 'h2h-inactive',
      visibility: 'public',
    })

    // Alice and Bob play both weeklies; Carol only shows up once.
    await importWeekly(
      league,
      'h2h-inactive-week-1',
      'name\nAlice\nBob\nCarol\n',
      'entrant_a,entrant_b,score_a,score_b\nAlice,Bob,3,1\nBob,Carol,3,0\n'
    )
    await importWeekly(
      league,
      'h2h-inactive-week-2',
      'name\nAlice\nBob\n',
      'entrant_a,entrant_b,score_a,score_b\nAlice,Bob,3,2\n'
    )

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

    const players = await h2hPlayers(client, league)

    // Everyone still gets a row, unlike the rankings page's default of
    // dropping anyone who fails a requirement.
    assert.sameMembers(
      players.map((player) => player.displayTag),
      ['Alice', 'Bob', 'Carol']
    )

    const byPlayer = new Map(players.map((player) => [player.displayTag, player.inactive]))
    assert.isFalse(byPlayer.get('Alice'))
    assert.isFalse(byPlayer.get('Bob'))
    assert.isTrue(byPlayer.get('Carol'))
  })

  test('lists every ranking and switches to the one named in the query string', async ({
    client,
    assert,
  }) => {
    const league = await League.create({
      slug: 'h2h-switch',
      name: 'h2h-switch',
      visibility: 'public',
    })

    await importWeekly(
      league,
      'h2h-switch-week-1',
      'name\nAlice\nBob\n',
      'entrant_a,entrant_b,winner\nAlice,Bob,Alice\n'
    )

    const first = await Ranking.create({
      leagueId: league.id,
      slug: 'first',
      name: 'First',
      algorithm: 'elo',
      recomputeMode: 'manual',
      published: true,
    })
    await new RankingRecomputerService().run(first.id)

    const second = await Ranking.create({
      leagueId: league.id,
      slug: 'second',
      name: 'Second',
      algorithm: 'elo',
      recomputeMode: 'manual',
      published: true,
    })
    await new RankingRecomputerService().run(second.id)

    // No override: falls back to `resolveRanking`'s default (first published
    // ranking with a completed recompute), same as `PlayersController`.
    const defaultProps = await h2hProps(client, league)
    assert.sameDeepMembers(defaultProps.rankings, [
      { slug: 'first', name: 'First' },
      { slug: 'second', name: 'Second' },
    ])

    // Explicit override via the query string the page's `<select>` writes.
    const switched = await h2hProps(client, league, { ranking: 'second' })
    assert.equal(switched.ranking?.slug, 'second')
  })
})
