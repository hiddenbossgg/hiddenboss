import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import EventImport from '#models/event_import'
import League from '#models/league'
import LeagueAdmin from '#models/league_admin'
import LeagueCredential from '#models/league_credential'
import LeagueEvent from '#models/league_event'
import LeaguePlayer from '#models/league_player'
import Ranking from '#models/ranking'
import User from '#models/user'
import { platforms } from '#lib/platforms/registry'
import { EventImporterService } from '#services/imports/event_importer_service'
import { IdentityResolverService } from '#services/identity/identity_resolver_service'
import { RankingRecomputerService } from '#services/rankings/ranking_recomputer_service'
import { FakePlatformAdapter } from '../unit/platforms/fake_adapter.js'

/**
 * Truncates rather than wrapping in a transaction: the importer takes a
 * Postgres advisory lock released only at top-level commit.
 */
test.group('league clear and delete', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  group.each.setup(() => {
    platforms.register(new FakePlatformAdapter())
    return () => platforms.unregister('fake')
  })

  async function seedLeagueWithOwner() {
    const owner = await User.create({
      email: `owner-${Math.random()}@example.com`,
      password: 'secret123',
      fullName: 'Owner',
    })

    const league = await League.create({
      slug: `clear-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Clear League',
      visibility: 'public',
    })

    await LeagueAdmin.create({ leagueId: league.id, userId: owner.id, role: 'owner' })

    const credential = new LeagueCredential()
    credential.leagueId = league.id
    credential.platformKey = 'fake'
    credential.values = { apiKey: 'test-key' }
    await credential.save()

    return { owner, league }
  }

  async function importEvent(league: League) {
    const eventImport = await EventImport.create({
      leagueId: league.id,
      platformKey: 'fake',
      targetUrl: 'https://fake.test/t/fake-major',
      status: 'queued',
    })

    const finished = await new EventImporterService().run({ eventImportId: eventImport.id })
    await new IdentityResolverService().run({ leagueId: league.id, eventId: finished.eventId! })

    return finished
  }

  test('clears rankings, players and imports but keeps the league, admins and credentials', async ({
    client,
    assert,
  }) => {
    const { owner, league } = await seedLeagueWithOwner()
    await importEvent(league)

    const ranking = await Ranking.create({
      leagueId: league.id,
      slug: 'ranking',
      name: 'Ranking',
      algorithm: 'elo',
      recomputeMode: 'manual',
      published: true,
    })
    await new RankingRecomputerService().run(ranking.id)

    const players = await LeaguePlayer.query().where('leagueId', league.id)
    assert.isAbove(players.length, 0)

    const response = await client
      .post(`/${league.slug}/clear`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)

    // Gone.
    assert.lengthOf(await Ranking.query().where('leagueId', league.id), 0)
    assert.lengthOf(await LeaguePlayer.query().where('leagueId', league.id), 0)
    assert.lengthOf(await LeagueEvent.query().where('leagueId', league.id), 0)
    assert.lengthOf(await EventImport.query().where('leagueId', league.id), 0)

    // Kept.
    assert.isNotNull(await League.find(league.id))
    assert.lengthOf(await LeagueAdmin.query().where('leagueId', league.id), 1)
    assert.lengthOf(await LeagueCredential.query().where('leagueId', league.id), 1)
  })

  test('re-importing after a clear works, since canonical data was untouched', async ({
    client,
    assert,
  }) => {
    const { owner, league } = await seedLeagueWithOwner()
    const eventImport = await importEvent(league)

    await client.post(`/${league.slug}/clear`).loginAs(owner).withCsrfToken()

    await importEvent(league)

    const link = await LeagueEvent.query()
      .where('leagueId', league.id)
      .where('eventId', eventImport.eventId!)
      .first()
    assert.isNotNull(link)
  })

  /**
   * `bouncer.authorize()` denying a POST/PUT/PATCH/DELETE request redirects
   * back with a flash error rather than returning a raw 403 — AdonisJS's own
   * default `AuthorizationException` behaviour for form-style submissions —
   * so what proves the denial is what didn't happen, not the status code.
   */
  test('a non-owner admin cannot clear or delete the league', async ({ client, assert }) => {
    const { league } = await seedLeagueWithOwner()
    await importEvent(league)

    const member = await User.create({
      email: `member-${Math.random()}@example.com`,
      password: 'secret123',
      fullName: 'Member',
    })
    await LeagueAdmin.create({ leagueId: league.id, userId: member.id, role: 'member' })

    await client.post(`/${league.slug}/clear`).loginAs(member).withCsrfToken()
    const links = await LeagueEvent.query().where('leagueId', league.id)
    assert.isAbove(links.length, 0, 'a non-owner must not be able to clear the league')

    await client.delete(`/${league.slug}`).loginAs(member).withCsrfToken()
    assert.isNotNull(
      await League.find(league.id),
      'a non-owner must not be able to delete the league'
    )
  })

  test('an owner can delete the league entirely', async ({ client, assert }) => {
    const { owner, league } = await seedLeagueWithOwner()

    const response = await client
      .delete(`/${league.slug}`)
      .loginAs(owner)
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)
    assert.isNull(await League.find(league.id))
  })
})
