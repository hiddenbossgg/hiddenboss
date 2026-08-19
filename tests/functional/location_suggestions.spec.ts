import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import League from '#models/league'
import LeagueAdmin from '#models/league_admin'
import User from '#models/user'

/**
 * Authorisation for this route is covered generically by
 * `league_scoping.spec.ts`, which discovers every `/:league` route and
 * asserts it rejects non-members — coverage here is about what the endpoint
 * actually returns once a manager is let through.
 */
test.group('location suggestions', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function makeLeagueWithOwner() {
    const owner = await User.create({
      email: `owner-${Math.random()}@example.com`,
      password: 'secret123',
      fullName: 'Owner',
    })

    const league = await League.create({
      slug: `locations-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Locations League',
      visibility: 'public',
    })

    await LeagueAdmin.create({ leagueId: league.id, userId: owner.id, role: 'owner' })

    return { owner, league }
  }

  test('suggests a city with its state and country', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()

    const response = await client
      .get(`/${league.slug}/rankings/locations`)
      .loginAs(owner)
      .qs({ field: 'city', query: 'Spoka' })

    response.assertStatus(200)
    const { suggestions } = response.body()
    assert.isTrue(
      suggestions.some(
        (suggestion: any) =>
          suggestion.city === 'Spokane' && suggestion.state === 'WA' && suggestion.country === 'US'
      )
    )
  })

  test('scopes a city search to an already-chosen country', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()

    const response = await client
      .get(`/${league.slug}/rankings/locations`)
      .loginAs(owner)
      .qs({ field: 'city', query: 'London', country: 'CA' })

    response.assertStatus(200)
    const { suggestions } = response.body()
    assert.isAbove(suggestions.length, 0)
    assert.isTrue(suggestions.every((suggestion: any) => suggestion.country === 'CA'))
  })

  test('rejects an unknown field', async ({ client }) => {
    const { owner, league } = await makeLeagueWithOwner()

    const response = await client
      .get(`/${league.slug}/rankings/locations`)
      .loginAs(owner)
      .qs({ field: 'planet', query: 'Earth' })

    response.assertStatus(400)
  })
})
