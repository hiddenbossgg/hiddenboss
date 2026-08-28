import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import League from '#models/league'
import LeagueAdmin from '#models/league_admin'
import Ranking from '#models/ranking'
import User from '#models/user'

/**
 * A league's time zone controls what calendar date its tournaments display
 * and are edited in — see `#lib/time/local_date`. Coverage here is just the
 * settings form; the actual conversion is covered by `event_date_edit`.
 */
test.group('league settings', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function makeLeagueWithOwner() {
    const owner = await User.create({
      email: `owner-${Math.random()}@example.com`,
      password: 'secret123',
      fullName: 'Owner',
    })

    const league = await League.create({
      slug: `settings-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Settings League',
      visibility: 'public',
    })

    await LeagueAdmin.create({ leagueId: league.id, userId: owner.id, role: 'owner' })

    return { owner, league }
  }

  test('an admin can set the time zone', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()

    const response = await client
      .patch(`/${league.slug}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ name: league.name, timezone: 'America/New_York' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await League.findOrFail(league.id)
    assert.equal(reloaded.timezone, 'America/New_York')
  })

  test('blanking the field clears it back to unset', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()
    league.timezone = 'America/New_York'
    await league.save()

    const response = await client
      .patch(`/${league.slug}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ name: league.name, timezone: '' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await League.findOrFail(league.id)
    assert.isNull(reloaded.timezone)
  })

  test('a made-up zone is rejected rather than stored', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()

    const response = await client
      .patch(`/${league.slug}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ name: league.name, timezone: 'Mars/Olympus_Mons' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await League.findOrFail(league.id)
    assert.isNull(reloaded.timezone, 'the bad request should not have touched the row')
  })

  test('a non-admin is rejected', async ({ client }) => {
    const { league } = await makeLeagueWithOwner()
    const outsider = await User.create({
      email: `outsider-${Math.random()}@example.com`,
      password: 'secret123',
      fullName: 'Outsider',
    })

    const response = await client
      .patch(`/${league.slug}`)
      .loginAs(outsider)
      .withCsrfToken()
      .fields({ name: league.name, timezone: 'America/New_York' })
      .redirects(0)

    response.assertStatus(403)
  })

  /**
   * `SetSelectionService` reanchors a ranking's date range against its
   * league's current time zone on every recompute (see
   * `ranking_date_range_timezone.spec.ts`), so a league-level zone change can
   * change what such a ranking counts — but only for rankings that actually
   * have a range; one with no range never reads it.
   */
  test('changing the time zone recomputes an auto ranking with a date range', async ({
    client,
    assert,
  }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const ranking = await Ranking.create({
      leagueId: league.id,
      slug: 'ranking',
      name: 'Ranking',
      algorithm: 'elo',
      recomputeMode: 'auto',
      startsAt: DateTime.fromISO('2026-01-01'),
      published: true,
    })

    const response = await client
      .patch(`/${league.slug}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ name: league.name, timezone: 'America/New_York' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await Ranking.findOrFail(ranking.id)
    assert.isNotNull(
      reloaded.latestRecomputeId,
      'nothing else could have produced a recompute for a ranking with no prior one'
    )
  })

  test('changing the time zone leaves a ranking with no date range untouched', async ({
    client,
    assert,
  }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const ranking = await Ranking.create({
      leagueId: league.id,
      slug: 'ranking',
      name: 'Ranking',
      algorithm: 'elo',
      recomputeMode: 'auto',
      published: true,
    })

    const response = await client
      .patch(`/${league.slug}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ name: league.name, timezone: 'America/New_York' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await Ranking.findOrFail(ranking.id)
    assert.isNull(reloaded.latestRecomputeId, 'a rangeless ranking never reads the time zone')
    assert.isNull(reloaded.recomputeRequestedAt)
  })

  test('changing the time zone flags a manual ranking with a date range without recomputing it', async ({
    client,
    assert,
  }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const ranking = await Ranking.create({
      leagueId: league.id,
      slug: 'ranking',
      name: 'Ranking',
      algorithm: 'elo',
      recomputeMode: 'manual',
      endsAt: DateTime.fromISO('2026-06-30'),
      published: true,
    })

    const response = await client
      .patch(`/${league.slug}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ name: league.name, timezone: 'America/New_York' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await Ranking.findOrFail(ranking.id)
    assert.isNull(
      reloaded.latestRecomputeId,
      'manual rankings wait on an admin, even auto-stale ones'
    )
    assert.isNotNull(reloaded.recomputeRequestedAt)
  })
})
