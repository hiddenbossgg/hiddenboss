import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import League from '#models/league'
import User from '#models/user'

test.group('error pages', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  const inertiaGet = (client: any, url: string) =>
    client.get(url).header('X-Inertia', 'true').header('X-Inertia-Version', '1')

  test('an unmatched route renders the not-found page', async ({ client, assert }) => {
    const response = await inertiaGet(client, '/no/such/path/anywhere')

    response.assertStatus(404)
    assert.equal(response.body().component, 'errors/not_found')
  })

  test('an unknown league slug renders the not-found page, not raw JSON', async ({
    client,
    assert,
  }) => {
    const response = await inertiaGet(client, '/does-not-exist')

    response.assertStatus(404)
    assert.equal(response.body().component, 'errors/not_found')
  })

  test('a private league is not-found to a stranger', async ({ client, assert }) => {
    const owner = await User.create({
      email: `owner-${Math.random()}@example.com`,
      password: 'secret123',
      fullName: 'Owner',
    })
    const league = await League.create({
      slug: `priv-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Private',
      visibility: 'private',
      createdByUserId: owner.id,
    })

    const response = await inertiaGet(client, `/${league.slug}`)

    response.assertStatus(404)
    assert.equal(response.body().component, 'errors/not_found')
  })
})
