import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import League from '#models/league'
import LeagueAdmin from '#models/league_admin'
import LeaguePlayer from '#models/league_player'
import User from '#models/user'

/**
 * An admin's manual fix for a bad location — imported platform data is
 * sometimes wrong or missing, and this is the only override available for it.
 */
test.group('player location edit', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function makeLeagueWithOwner() {
    const owner = await User.create({
      email: `owner-${Math.random()}@example.com`,
      password: 'secret123',
      fullName: 'Owner',
    })

    const league = await League.create({
      slug: `loc-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Location League',
      visibility: 'public',
    })

    await LeagueAdmin.create({ leagueId: league.id, userId: owner.id, role: 'owner' })

    return { owner, league }
  }

  test('an admin correction persists', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const player = await LeaguePlayer.create({
      leagueId: league.id,
      slug: 'player-one',
      displayTag: 'Player One',
      city: 'Seatle',
    })

    const response = await client
      .patch(`/${league.slug}/players/${player.slug}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ city: 'Seattle', state: 'WA', country: 'United States' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await LeaguePlayer.findOrFail(player.id)
    assert.equal(reloaded.city, 'Seattle')
    assert.equal(reloaded.state, 'WA')
    assert.equal(reloaded.country, 'United States')
  })

  test('blanking a field clears it', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const player = await LeaguePlayer.create({
      leagueId: league.id,
      slug: 'player-two',
      displayTag: 'Player Two',
      city: 'Seattle',
      state: 'WA',
      country: 'United States',
    })

    const response = await client
      .patch(`/${league.slug}/players/${player.slug}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ city: '', state: '', country: '' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await LeaguePlayer.findOrFail(player.id)
    assert.isNull(reloaded.city)
    assert.isNull(reloaded.state)
    assert.isNull(reloaded.country)
  })

  test('a non-admin is rejected', async ({ client }) => {
    const { league } = await makeLeagueWithOwner()
    const outsider = await User.create({
      email: `outsider-${Math.random()}@example.com`,
      password: 'secret123',
      fullName: 'Outsider',
    })
    const player = await LeaguePlayer.create({
      leagueId: league.id,
      slug: 'player-three',
      displayTag: 'Player Three',
    })

    const response = await client
      .patch(`/${league.slug}/players/${player.slug}`)
      .loginAs(outsider)
      .withCsrfToken()
      .fields({ city: 'Seattle' })
      .redirects(0)

    response.assertStatus(403)
  })
})
