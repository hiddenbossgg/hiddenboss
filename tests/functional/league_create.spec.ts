import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import League from '#models/league'
import User from '#models/user'

/**
 * Time zone is the only field covered here — creation of name/slug/visibility
 * predates this feature and has no test coverage to extend; this is scoped to
 * what changed.
 */
test.group('league create', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function makeUser() {
    return User.create({
      email: `owner-${Math.random()}@example.com`,
      password: 'secret123',
      fullName: 'Owner',
    })
  }

  test('a time zone can be set at creation', async ({ client, assert }) => {
    const user = await makeUser()
    const slug = `trivals-${Math.random().toString(36).slice(2, 10)}`

    const response = await client
      .post('/leagues')
      .loginAs(user)
      .withCsrfToken()
      .fields({ name: 'Texas Rivals', slug, timezone: 'America/Chicago' })
      .redirects(0)

    response.assertStatus(302)

    const league = await League.findByOrFail('slug', slug)
    assert.equal(league.timezone, 'America/Chicago')
  })

  test('omitting it leaves the league on the UTC default', async ({ client, assert }) => {
    const user = await makeUser()
    const slug = `trivals-${Math.random().toString(36).slice(2, 10)}`

    const response = await client
      .post('/leagues')
      .loginAs(user)
      .withCsrfToken()
      .fields({ name: 'Texas Rivals', slug })
      .redirects(0)

    response.assertStatus(302)

    const league = await League.findByOrFail('slug', slug)
    assert.isNull(league.timezone)
  })

  test('a made-up zone is rejected rather than creating the league', async ({ client, assert }) => {
    const user = await makeUser()
    const slug = `trivals-${Math.random().toString(36).slice(2, 10)}`

    const response = await client
      .post('/leagues')
      .loginAs(user)
      .withCsrfToken()
      .fields({ name: 'Texas Rivals', slug, timezone: 'Mars/Olympus_Mons' })
      .redirects(0)

    response.assertStatus(302)

    const league = await League.findBy('slug', slug)
    assert.isNull(league, 'the bad request should not have created a league')
  })
})
