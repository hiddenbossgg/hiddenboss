import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import League from '#models/league'
import Ranking from '#models/ranking'

test.group('ranking show', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function makeLeague() {
    return League.create({
      slug: `rk-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Ranking League',
      visibility: 'public',
    })
  }

  test('an unknown slug renders the not-found page with a 404', async ({ client, assert }) => {
    const league = await makeLeague()

    const response = await client
      .get(`/${league.slug}/rankings/nothing`)
      .header('X-Inertia', 'true')
      .header('X-Inertia-Version', '1')

    response.assertStatus(404)
    assert.equal(response.body().component, 'leagues/ranking_not_found')
    assert.equal(response.body().props.slug, 'nothing')
  })

  test('a real slug still resolves', async ({ client }) => {
    const league = await makeLeague()
    const ranking = await Ranking.create({
      leagueId: league.id,
      slug: 'power',
      name: 'Power',
      algorithm: 'elo',
    })

    const response = await client
      .get(`/${league.slug}/rankings/${ranking.slug}`)
      .header('X-Inertia', 'true')
      .header('X-Inertia-Version', '1')

    response.assertStatus(200)
    response.assertBodyContains({ component: 'leagues/ranking' })
  })
})
