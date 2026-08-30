import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import League from '#models/league'
import LeagueAdmin from '#models/league_admin'
import LeaguePlayer from '#models/league_player'
import User from '#models/user'

/**
 * An admin's manual fix for a player — their tag and their location. Imported
 * platform data is sometimes an old handle, a stray prefix, or a wrong city,
 * and this one endpoint is the override for all of it.
 */
test.group('player edit', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function makeLeagueWithOwner() {
    const owner = await User.create({
      email: `owner-${Math.random()}@example.com`,
      password: 'secret123',
      fullName: 'Owner',
    })

    const league = await League.create({
      slug: `edit-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Edit League',
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
      .fields({ displayTag: 'Player One', city: 'Seattle', state: 'WA', country: 'United States' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await LeaguePlayer.findOrFail(player.id)
    assert.equal(reloaded.city, 'Seattle')
    assert.equal(reloaded.state, 'WA')
    // Normalised on write, same as the import path — "United States" in,
    // ISO alpha-2 stored, so it stays consistent with every other player.
    assert.equal(reloaded.country, 'US')
  })

  test('a rename persists and leaves the slug untouched', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const player = await LeaguePlayer.create({
      leagueId: league.id,
      slug: 'player-rename',
      displayTag: 'MSF | Zane',
    })

    const response = await client
      .patch(`/${league.slug}/players/${player.slug}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ displayTag: '  Zane  ' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await LeaguePlayer.findOrFail(player.id)
    // Trimmed on write.
    assert.equal(reloaded.displayTag, 'Zane')
    assert.equal(reloaded.slug, 'player-rename')
  })

  test('a whitespace-only tag is refused and changes nothing', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const player = await LeaguePlayer.create({
      leagueId: league.id,
      slug: 'player-blank-tag',
      displayTag: 'Keep',
      city: 'Portland',
    })

    // A failed validation flashes errors and redirects back rather than 422ing,
    // the same as every other form post in the app.
    const response = await client
      .patch(`/${league.slug}/players/${player.slug}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ displayTag: '   ', city: 'Seattle' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await LeaguePlayer.findOrFail(player.id)
    assert.equal(reloaded.displayTag, 'Keep')
    assert.equal(reloaded.city, 'Portland')
  })

  test('a state full name normalises to its ISO code, scoped by country', async ({
    client,
    assert,
  }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const player = await LeaguePlayer.create({
      leagueId: league.id,
      slug: 'player-state',
      displayTag: 'Player State',
    })

    const response = await client
      .patch(`/${league.slug}/players/${player.slug}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ displayTag: 'Player State', state: 'Washington', country: 'US' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await LeaguePlayer.findOrFail(player.id)
    assert.equal(reloaded.state, 'WA')
  })

  test('an unrecognised country is dropped to null rather than kept as typed', async ({
    client,
    assert,
  }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const player = await LeaguePlayer.create({
      leagueId: league.id,
      slug: 'player-bad-country',
      displayTag: 'Player Bad Country',
    })

    const response = await client
      .patch(`/${league.slug}/players/${player.slug}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ displayTag: 'Player Bad Country', country: 'Wakanda' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await LeaguePlayer.findOrFail(player.id)
    assert.isNull(reloaded.country)
  })

  test('blanking a location field clears it', async ({ client, assert }) => {
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
      .fields({ displayTag: 'Player Two', city: '', state: '', country: '' })
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
      .fields({ displayTag: 'Player Three', city: 'Seattle' })
      .redirects(0)

    response.assertStatus(403)
  })
})
