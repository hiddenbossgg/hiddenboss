import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import League from '#models/league'
import LeaguePlayer from '#models/league_player'

test.group('player show', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('an unknown slug renders the not-found page with a 404', async ({ client, assert }) => {
    const league = await League.create({
      slug: `show-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Show League',
      visibility: 'public',
    })

    const response = await client
      .get(`/${league.slug}/players/nobody`)
      .header('X-Inertia', 'true')
      .header('X-Inertia-Version', '1')

    response.assertStatus(404)
    assert.equal(response.body().component, 'leagues/player_not_found')
    assert.equal(response.body().props.slug, 'nobody')
  })

  test('a real slug still resolves', async ({ client }) => {
    const league = await League.create({
      slug: `show-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Show League',
      visibility: 'public',
    })
    const player = await LeaguePlayer.create({
      leagueId: league.id,
      slug: 'someone',
      displayTag: 'Someone',
    })

    const response = await client
      .get(`/${league.slug}/players/${player.slug}`)
      .header('X-Inertia', 'true')
      .header('X-Inertia-Version', '1')

    response.assertStatus(200)
    response.assertBodyContains({ component: 'leagues/player' })
  })
})
