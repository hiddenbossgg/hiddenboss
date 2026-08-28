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
 * An admin's manual fix for a bad tournament start date — imported platform
 * data is sometimes wrong or missing, and this is the only override available
 * for it.
 */
test.group('event date edit', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function makeLeagueWithOwner() {
    const owner = await User.create({
      email: `owner-${Math.random()}@example.com`,
      password: 'secret123',
      fullName: 'Owner',
    })

    const league = await League.create({
      slug: `evdate-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Event Date League',
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
      .patch(`/${league.slug}/events/${event.id}/date`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ startAt: '2026-01-06' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await Tournament.findOrFail(tournament.id)
    assert.equal(reloaded.startAt?.toISODate(), '2026-01-06')
  })

  test("a correction anchors to the league's time zone, not UTC", async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()
    league.timezone = 'America/New_York'
    await league.save()
    const { tournament, event } = await makeCountedEvent(league)

    const response = await client
      .patch(`/${league.slug}/events/${event.id}/date`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ startAt: '2026-01-06' })
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

  test('blanking the field clears it', async ({ client, assert }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const { tournament, event } = await makeCountedEvent(league)

    const response = await client
      .patch(`/${league.slug}/events/${event.id}/date`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ startAt: '' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await Tournament.findOrFail(tournament.id)
    assert.isNull(reloaded.startAt)
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
      .patch(`/${league.slug}/events/${event.id}/date`)
      .loginAs(outsider)
      .withCsrfToken()
      .fields({ startAt: '2026-01-06' })
      .redirects(0)

    response.assertStatus(403)
  })

  test('an event not counted by the league is rejected', async ({ client }) => {
    const { owner, league } = await makeLeagueWithOwner()
    const { league: otherLeague } = await makeLeagueWithOwner()
    const { event } = await makeCountedEvent(otherLeague)

    const response = await client
      .patch(`/${league.slug}/events/${event.id}/date`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ startAt: '2026-01-06' })
      .redirects(0)

    response.assertStatus(404)
  })

  test('forces a real recompute of an auto ranking, not a skipped one', async ({
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
      .patch(`/${league.slug}/events/${event.id}/date`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ startAt: '2026-01-06' })
      .redirects(0)

    response.assertStatus(302)

    const reloaded = await Ranking.findOrFail(ranking.id)
    assert.notEqual(
      reloaded.latestRecomputeId,
      before.recompute.id,
      'a date correction must force past the fingerprint skip-check, not be silently no-opped'
    )

    // Sanity check the fix actually took, so the tournament used above stays honest.
    const tournamentReloaded = await Tournament.findOrFail(tournament.id)
    assert.equal(tournamentReloaded.startAt?.toISODate(), '2026-01-06')
  })
})
