import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import League from '#models/league'
import LeagueAdmin from '#models/league_admin'
import LeagueEvent from '#models/league_event'
import Event from '#models/event'
import Ranking from '#models/ranking'
import Tournament from '#models/tournament'
import User from '#models/user'
import { RankingRecomputerService } from '#services/rankings/ranking_recomputer_service'

/**
 * An admin's manual fix for bad event data — the event and tournament names,
 * plus the tournament's date and location, corrected together through one
 * endpoint. Imported platform data is sometimes wrong or missing, and this is
 * the only override available for it.
 */
test.group('event edit', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /** The combined form always submits the names, so tests do too. */
  function fields(overrides: Record<string, string> = {}) {
    return { eventName: 'Singles', tournamentName: 'Fake Major', ...overrides }
  }

  async function makeLeagueWithOwner() {
    const owner = await User.create({
      email: `owner-${Math.random()}@example.com`,
      password: 'secret123',
      fullName: 'Owner',
    })

    const league = await League.create({
      slug: `evedit-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Event Edit League',
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
      startAt: DateTime.fromISO('2026-01-05'),
      city: 'Portland',
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

  test('a name correction persists on both the event and the tournament', async ({
    client,
    assert,
  }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const { tournament, event } = await makeCountedEvent(league)

    const response = await client
      .patch(`/${league.slug}/events/${event.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields(fields({ eventName: '  Doubles  ', tournamentName: 'Fake Minor', city: 'Portland' }))
      .redirects(0)

    response.assertStatus(302)

    const reloadedEvent = await Event.findOrFail(event.id)
    const reloadedTournament = await Tournament.findOrFail(tournament.id)
    assert.equal(reloadedEvent.name, 'Doubles') // trimmed on write
    assert.equal(reloadedTournament.name, 'Fake Minor')
  })

  test('an empty name is refused and changes nothing', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const { event } = await makeCountedEvent(league)

    const response = await client
      .patch(`/${league.slug}/events/${event.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields(fields({ eventName: '   ', city: 'Seattle' }))
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await Event.findOrFail(event.id)
    assert.equal(reloaded.name, 'Singles')
  })

  test('a date correction persists and leaves the location alone', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const { tournament, event } = await makeCountedEvent(league)

    const response = await client
      .patch(`/${league.slug}/events/${event.id}`)
      .loginAs(owner)
      .withCsrfToken()
      // The one form resubmits every field, so the unchanged city rides along.
      .fields(fields({ startAt: '2026-01-06', city: 'Portland' }))
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await Tournament.findOrFail(tournament.id)
    assert.equal(reloaded.startAt?.toISODate(), '2026-01-06')
    assert.equal(reloaded.city, 'Portland')
  })

  test("a date correction anchors to the league's time zone, not UTC", async ({
    client,
    assert,
  }) => {
    const { owner, league } = await makeLeagueWithOwner()
    league.timezone = 'America/New_York'
    await league.save()
    const { tournament, event } = await makeCountedEvent(league)

    const response = await client
      .patch(`/${league.slug}/events/${event.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields(fields({ startAt: '2026-01-06', city: 'Portland' }))
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await Tournament.findOrFail(tournament.id)
    /**
     * "2026-01-06" means midnight in New York (EST, UTC-5 in January), not
     * midnight UTC — the whole point of a league time zone is that reading
     * this instant back through the same league reports "2026-01-06" again
     * rather than rolling to the next UTC day.
     */
    assert.equal(reloaded.startAt?.toUTC().toISO(), '2026-01-06T05:00:00.000Z')
  })

  test('a location correction persists and leaves the date alone', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const { tournament, event } = await makeCountedEvent(league)

    const response = await client
      .patch(`/${league.slug}/events/${event.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields(
        fields({ startAt: '2026-01-05', city: 'Seattle', state: 'WA', country: 'United States' })
      )
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await Tournament.findOrFail(tournament.id)
    assert.equal(reloaded.city, 'Seattle')
    assert.equal(reloaded.state, 'WA')
    // `tournaments.country` is varchar(2), so a typed display name normalises
    // to its ISO alpha-2 code rather than being stored verbatim.
    assert.equal(reloaded.country, 'US')
    assert.equal(reloaded.startAt?.toISODate(), '2026-01-05')
  })

  test('blanking the fields clears date and location together', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const { tournament, event } = await makeCountedEvent(league)
    tournament.merge({ state: 'OR', country: 'US' })
    await tournament.save()

    const response = await client
      .patch(`/${league.slug}/events/${event.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields(fields({ startAt: '', city: '', state: '', country: '' }))
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await Tournament.findOrFail(tournament.id)
    assert.isNull(reloaded.startAt)
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
      .patch(`/${league.slug}/events/${event.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields(fields({ country: 'Not A Country' }))
      .redirects(0)

    // Validation failure on a form request redirects back with flashed
    // errors, same as any other Vine rejection in this app.
    response.assertStatus(302)

    const reloaded = await Tournament.findOrFail(tournament.id)
    assert.equal(reloaded.city, 'Portland', 'the bad request should not have touched the row')
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
      .patch(`/${league.slug}/events/${event.id}`)
      .loginAs(outsider)
      .withCsrfToken()
      .fields(fields({ city: 'Seattle' }))
      .redirects(0)

    response.assertStatus(403)
  })

  test('an event not counted by the league is rejected', async ({ client }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const { league: otherLeague } = await makeLeagueWithOwner()
    const { event } = await makeCountedEvent(otherLeague)

    const response = await client
      .patch(`/${league.slug}/events/${event.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields(fields({ city: 'Seattle' }))
      .redirects(0)

    response.assertStatus(404)
  })

  test('a date correction forces a real recompute of an auto ranking, not a skipped one', async ({
    client,
    assert,
  }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const { tournament, event } = await makeCountedEvent(league)

    const ranking = await Ranking.create({
      leagueId: league.id,
      slug: 'ranking',
      name: 'Ranking',
      algorithm: 'elo',
      recomputeMode: 'auto',
      published: true,
    })

    /**
     * A tournament's date is not part of the fingerprint the recomputer
     * skip-checks against (it tracks set identity and order, not the raw
     * date value), so a same-slot correction that doesn't reorder anything
     * relative to other tournaments would otherwise leave the standing's
     * stored occurred-at date silently stale.
     */
    const before = await new RankingRecomputerService().run(ranking.id)
    assert.isFalse(before.skipped)

    const response = await client
      .patch(`/${league.slug}/events/${event.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields(fields({ startAt: '2026-01-06', city: 'Portland' }))
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await Ranking.findOrFail(ranking.id)
    assert.notEqual(
      reloaded.latestRecomputeId,
      before.recompute.id,
      'a date correction must force past the fingerprint skip-check, not be silently no-opped'
    )

    const tournamentReloaded = await Tournament.findOrFail(tournament.id)
    assert.equal(tournamentReloaded.startAt?.toISODate(), '2026-01-06')
  })

  test('a location correction forces a real recompute of an auto ranking, not a skipped one', async ({
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
      .patch(`/${league.slug}/events/${event.id}`)
      .loginAs(owner)
      .withCsrfToken()
      .fields(
        fields({ startAt: '2026-01-05', city: 'Seattle', state: 'WA', country: 'United States' })
      )
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
