import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Event from '#models/event'
import League from '#models/league'
import LeagueEvent from '#models/league_event'
import Tournament from '#models/tournament'

test.group('event show', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function makeLeague() {
    return League.create({
      slug: `ev-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Event League',
      visibility: 'public',
    })
  }

  const inertiaGet = (client: any, url: string) =>
    client.get(url).header('X-Inertia', 'true').header('X-Inertia-Version', '1')

  test('a non-uuid param renders the not-found page instead of a 500', async ({
    client,
    assert,
  }) => {
    const league = await makeLeague()

    const response = await inertiaGet(client, `/${league.slug}/events/foo`)

    response.assertStatus(404)
    assert.equal(response.body().component, 'leagues/event_not_found')
  })

  test('a well-formed id the league does not count is not found', async ({ client, assert }) => {
    const league = await makeLeague()

    const response = await inertiaGet(
      client,
      `/${league.slug}/events/01920000-0000-7000-8000-000000000000`
    )

    response.assertStatus(404)
    assert.equal(response.body().component, 'leagues/event_not_found')
  })

  test('a counted event still resolves', async ({ client }) => {
    const league = await makeLeague()
    const tournament = await Tournament.create({
      externalId: 't-1',
      name: 'Weekly',
      platformKey: 'manual',
      slug: 't-1',
    })
    const event = await Event.create({
      externalId: 'e-1',
      name: 'Singles',
      tournamentId: tournament.id,
      entryKind: 'singles',
    })
    await LeagueEvent.create({ leagueId: league.id, eventId: event.id })

    const response = await inertiaGet(client, `/${league.slug}/events/${event.id}`)

    response.assertStatus(200)
    response.assertBodyContains({ component: 'leagues/event' })
  })
})
