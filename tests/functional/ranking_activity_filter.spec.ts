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

  test('default DQ policy drops a tournament where the player was disqualified before playing a set', async ({
    client,
    assert,
  }) => {
    const league = await League.create({
      slug: 'dq-no-shows',
      name: 'dq-no-shows',
      visibility: 'public',
    })

    await importWeekly(
      league,
      'dq-no-shows-week-1',
      'name\nAlice\nCarol\n',
      'entrant_a,entrant_b,score_a,score_b\nAlice,Carol,3,1\n'
    )

    // Carol never plays a set here — disqualified before the bracket starts,
    // so Alice takes it as a walkover.
    await importWeekly(
      league,
      'dq-no-shows-week-2',
      'name\nAlice\nCarol\n',
      'entrant_a,entrant_b,score_a,score_b,dq_a,dq_b\nAlice,Carol,,,,yes\n'
    )

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
    const byPlayer = new Map(standings.map((standing) => [standing.player, standing.inactive]))

    // Alice played a real set in both weeks — the walkover was Carol's DQ,
    // not hers — so she still clears the two-tournament requirement.
    assert.isFalse(byPlayer.get('Alice'))
    // Carol only has one tournament with a set she actually played.
    assert.isTrue(byPlayer.get('Carol'))
  })

  /**
   * One tournament, one player disqualified twice after already playing a
   * real set — chosen so `exclude_no_shows` (which only cares whether
   * anything was played), `exclude_double_dq` (which counts the DQs) and
   * `exclude_any_dq` (which cares only whether any DQ happened) disagree,
   * proving each policy is actually wired to its own rule rather than one
   * of the others.
   */
  test('DQ policy is read at standings time and changes which tournaments count', async ({
    client,
    assert,
  }) => {
    const league = await League.create({
      slug: 'dq-policies',
      name: 'dq-policies',
      visibility: 'public',
    })

    await importWeekly(
      league,
      'dq-policies-week-1',
      'name\nEve\nFaye\nGwen\nHank\n',
      `entrant_a,entrant_b,score_a,score_b,dq_a,dq_b
Eve,Faye,3,1,,
Eve,Gwen,,,yes,
Eve,Hank,,,yes,
`
    )

    async function inactiveFor(
      dqPolicy: 'exclude_no_shows' | 'exclude_double_dq' | 'exclude_any_dq'
    ) {
      const ranking = await Ranking.create({
        leagueId: league.id,
        slug: `ranking-${dqPolicy}`,
        name: dqPolicy,
        algorithm: 'elo',
        recomputeMode: 'manual',
        activityRequirements: [{ count: 1, minEntrants: null }],
        flagInactive: true,
        dqPolicy,
        published: true,
      })
      await new RankingRecomputerService().run(ranking.id)

      const standings = await standingsFor(client, league, ranking)
      return standings.find((standing) => standing.player === 'Eve')!.inactive
    }

    // Eve played a real set before being disqualified twice, so a policy
    // that only cares about no-shows still counts the tournament.
    assert.isFalse(await inactiveFor('exclude_no_shows'))
    // Disqualified twice — excluded under both DQ-count-sensitive policies.
    assert.isTrue(await inactiveFor('exclude_double_dq'))
    assert.isTrue(await inactiveFor('exclude_any_dq'))
  })
})
