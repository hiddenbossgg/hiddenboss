import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import League from '#models/league'
import LeagueAdmin from '#models/league_admin'
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
})
