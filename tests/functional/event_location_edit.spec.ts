import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import League from '#models/league'
import LeagueAdmin from '#models/league_admin'
import LeagueEvent from '#models/league_event'
import Event from '#models/event'
import Ranking from '#models/ranking'
import Tournament from '#models/tournament'
import User from '#models/user'
import { RankingRecomputerService } from '#services/rankings/ranking_recomputer_service'

/**
 * An admin's manual fix for a bad tournament location — imported platform
 * data is sometimes wrong or missing, and this is the only override available
 * for it.
 */
test.group('event location edit', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function makeLeagueWithOwner() {
    const owner = await User.create({
      email: `owner-${Math.random()}@example.com`,
      password: 'secret123',
      fullName: 'Owner',
    })

    const league = await League.create({
      slug: `evloc-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Event Location League',
      visibility: 'public',
    })

    await LeagueAdmin.create({ leagueId: league.id, userId: owner.id, role: 'owner' })

    return { owner, league }
  }

  async function makeCountedEvent(league: League) {
    const tournament = await Tournament.create({
      externalId: `t-${Math.random().toString(36).slice(2, 10)}`,
      platformKey: 'fake',
      slug: `tournament-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Fake Major',
      city: 'Seatle',
    })

    const event = await Event.create({
      tournamentId: tournament.id,
      externalId: `e-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Singles',
      entryKind: 'singles',
    })

    await LeagueEvent.create({ leagueId: league.id, eventId: event.id })

    return { tournament, event }
  }

  test('an admin correction persists', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const { tournament, event } = await makeCountedEvent(league)

    const response = await client
      .patch(`/${league.slug}/events/${event.id}/location`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ city: 'Seattle', state: 'WA', country: 'United States' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await Tournament.findOrFail(tournament.id)
    assert.equal(reloaded.city, 'Seattle')
    assert.equal(reloaded.state, 'WA')
    // `tournaments.country` is varchar(2), so a typed display name normalises
    // to its ISO alpha-2 code rather than being stored verbatim.
    assert.equal(reloaded.country, 'US')
  })

  test('blanking a field clears it', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const { tournament, event } = await makeCountedEvent(league)
    tournament.merge({ city: 'Seattle', state: 'WA', country: 'US' })
    await tournament.save()

    const response = await client
      .patch(`/${league.slug}/events/${event.id}/location`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ city: '', state: '', country: '' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await Tournament.findOrFail(tournament.id)
    assert.isNull(reloaded.city)
    assert.isNull(reloaded.state)
    assert.isNull(reloaded.country)
  })

  test('an unrecognized country is rejected rather than crashing the write', async ({
    client,
    assert,
  }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const { tournament, event } = await makeCountedEvent(league)

    const response = await client
      .patch(`/${league.slug}/events/${event.id}/location`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ country: 'Not A Country' })
      .redirects(0)

    // Validation failure on a form request redirects back with flashed
    // errors, same as any other Vine rejection in this app.
    response.assertStatus(302)

    const reloaded = await Tournament.findOrFail(tournament.id)
    assert.equal(reloaded.city, 'Seatle', 'the bad request should not have touched the row')
  })

  test('a non-admin is rejected', async ({ client }) => {
    const { league } = await makeLeagueWithOwner()
    const { event } = await makeCountedEvent(league)
    const outsider = await User.create({
      email: `outsider-${Math.random()}@example.com`,
      password: 'secret123',
      fullName: 'Outsider',
    })

    const response = await client
      .patch(`/${league.slug}/events/${event.id}/location`)
      .loginAs(outsider)
      .withCsrfToken()
      .fields({ city: 'Seattle' })
      .redirects(0)

    response.assertStatus(403)
  })

  test('an event not counted by the league is rejected', async ({ client }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const { league: otherLeague } = await makeLeagueWithOwner()
    const { event } = await makeCountedEvent(otherLeague)

    const response = await client
      .patch(`/${league.slug}/events/${event.id}/location`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ city: 'Seattle' })
      .redirects(0)

    response.assertStatus(404)
  })

  test('forces a real recompute of an auto ranking, not a skipped one', async ({
    client,
    assert,
  }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const { event } = await makeCountedEvent(league)

    const ranking = await Ranking.create({
      leagueId: league.id,
      slug: 'ranking',
      name: 'Ranking',
      algorithm: 'elo',
      recomputeMode: 'auto',
      published: true,
    })

    /**
     * A tournament's location is baked into `ranking_standings` at recompute
     * time for a location-scoped activity requirement to read back later,
     * but it is not part of the fingerprint the recomputer skip-checks
     * against, so a correction would otherwise be silently no-opped.
     */
    const before = await new RankingRecomputerService().run(ranking.id)
    assert.isFalse(before.skipped)

    const response = await client
      .patch(`/${league.slug}/events/${event.id}/location`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ city: 'Seattle', state: 'WA', country: 'United States' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await Ranking.findOrFail(ranking.id)
    assert.notEqual(
      reloaded.latestRecomputeId,
      before.recompute.id,
      'a location correction must force past the fingerprint skip-check, not be silently no-opped'
    )
  })
})
