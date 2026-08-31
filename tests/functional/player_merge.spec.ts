import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Entrant from '#models/entrant'
import EntrantParticipant from '#models/entrant_participant'
import Event from '#models/event'
import IdentityEvent from '#models/identity_event'
import League from '#models/league'
import LeagueAdmin from '#models/league_admin'
import LeagueEvent from '#models/league_event'
import LeaguePlayer from '#models/league_player'
import LeaguePlayerAccount from '#models/league_player_account'
import PlatformAccount from '#models/platform_account'
import Ranking from '#models/ranking'
import Tournament from '#models/tournament'
import User from '#models/user'
import {
  PlayerMergeService,
  UnresolvedMergeConflictError,
} from '#services/identity/player_merge_service'

/**
 * A merge is a bulk reassignment that has to stay reversible: accounts move
 * rather than being deleted, the emptied row is tombstoned, and every field the
 * two rows disagreed on is either resolved by the caller or left to the rule
 * that a populated value beats an empty one.
 */
test.group('player merge', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let seq = 0
  async function account(gamerTag: string) {
    seq += 1
    return PlatformAccount.create({
      platformKey: 'startgg',
      externalUserId: `user-${seq}`,
      gamerTag,
      normalizedTag: gamerTag.toLowerCase(),
      weakIdentity: false,
    })
  }

  type PlayerFields = Partial<{
    displayTag: string
    city: string | null
    state: string | null
    country: string | null
    pronouns: string | null
  }>

  async function seed(overrides: { a?: PlayerFields; b?: PlayerFields } = {}) {
    seq += 1
    const league = await League.create({ slug: `merge-l-${seq}`, name: 'Merge' })

    const a = await LeaguePlayer.create({
      leagueId: league.id,
      slug: 'zain',
      displayTag: 'Zain',
      ...overrides.a,
    })
    const b = await LeaguePlayer.create({
      leagueId: league.id,
      slug: 'zain-2',
      displayTag: 'Zain',
      ...overrides.b,
    })

    const link = async (player: LeaguePlayer, gamerTag: string) => {
      const platformAccount = await account(gamerTag)
      return LeaguePlayerAccount.create({
        leagueId: league.id,
        leaguePlayerId: player.id,
        platformAccountId: platformAccount.id,
        source: 'auto',
      })
    }

    return { league, a, b, link }
  }

  /** A minimal entrant graph: one tournament + event, one entrant per account. */
  async function enterEvent(league: League, name: string, platformAccountIds: string[]) {
    seq += 1
    const tournament = await Tournament.create({
      externalId: `t-${seq}`,
      name,
      platformKey: 'manual',
      slug: `t-${seq}`,
    })
    const event = await Event.create({
      externalId: `e-${seq}`,
      name: `${name} Singles`,
      tournamentId: tournament.id,
      entryKind: 'singles',
    })
    await LeagueEvent.create({ leagueId: league.id, eventId: event.id })

    for (const platformAccountId of platformAccountIds) {
      seq += 1
      const entrant = await Entrant.create({
        eventId: event.id,
        externalId: `en-${seq}`,
        name: 'entrant',
      })
      await EntrantParticipant.create({ entrantId: entrant.id, platformAccountId })
    }

    return event
  }

  test('moves every account to the survivor and tombstones the merged row', async ({ assert }) => {
    const { league, a, b, link } = await seed()
    await link(a, 'zain')
    const moved = [await link(b, 'zain-alt'), await link(b, 'zain-alt-2')]

    const result = await new PlayerMergeService().merge({
      leagueId: league.id,
      survivorId: a.id,
      mergedId: b.id,
      resolutions: {},
      actorUserId: null,
    })

    assert.equal(result.movedAccounts, 2)

    const survivorAccounts = await LeaguePlayerAccount.query()
      .where('leagueId', league.id)
      .where('leaguePlayerId', a.id)
    assert.lengthOf(survivorAccounts, 3)

    // The reassigned mappings are marked manual; the survivor's own is untouched.
    for (const mapping of moved) {
      const reloaded = await LeaguePlayerAccount.findOrFail(mapping.id)
      assert.equal(reloaded.leaguePlayerId, a.id)
      assert.equal(reloaded.source, 'manual')
    }

    const mergedRow = await LeaguePlayer.findOrFail(b.id)
    assert.equal(mergedRow.mergedIntoId, a.id)
  })

  test('appends a reversible merge event carrying what moved and the prior values', async ({
    assert,
  }) => {
    const { league, a, b, link } = await seed({ a: { displayTag: 'Zain', city: 'Reston' } })
    await link(a, 'zain')
    await link(b, 'zain-alt')

    await new PlayerMergeService().merge({
      leagueId: league.id,
      survivorId: a.id,
      mergedId: b.id,
      resolutions: { city: 'Reston' },
      actorUserId: null,
    })

    const events = await IdentityEvent.query().where('leagueId', league.id)
    assert.lengthOf(events, 1)
    assert.equal(events[0].kind, 'merge')
    assert.deepInclude(events[0].payload, {
      survivorLeaguePlayerId: a.id,
      mergedLeaguePlayerId: b.id,
    })
    assert.lengthOf(events[0].payload.movedPlatformAccountIds, 1)
    assert.equal(events[0].payload.survivorBefore.city, 'Reston')
    assert.equal(events[0].payload.resolutions.city, 'Reston')
  })

  test('applies the chosen value for a field only one row carries', async ({ assert }) => {
    const { league, a, b, link } = await seed({
      a: { city: null, country: 'United States', pronouns: null },
      b: { city: 'Reston', country: 'United States', pronouns: 'they/them' },
    })
    await link(a, 'zain')
    await link(b, 'zain-alt')

    await new PlayerMergeService().merge({
      leagueId: league.id,
      survivorId: a.id,
      mergedId: b.id,
      resolutions: { city: 'Reston', pronouns: 'they/them' },
      actorUserId: null,
    })

    const survivor = await LeaguePlayer.findOrFail(a.id)
    assert.equal(survivor.city, 'Reston')
    assert.equal(survivor.pronouns, 'they/them')
  })

  test('refuses a field only one row carries when it is left unresolved', async ({ assert }) => {
    const { league, a, b, link } = await seed({ b: { city: 'Reston' } })
    await link(a, 'zain')
    await link(b, 'zain-alt')

    let caught: unknown
    try {
      await new PlayerMergeService().merge({
        leagueId: league.id,
        survivorId: a.id,
        mergedId: b.id,
        resolutions: {},
        actorUserId: null,
      })
    } catch (error) {
      caught = error
    }
    assert.instanceOf(caught, UnresolvedMergeConflictError)
  })

  test('clears the survivor’s value when the empty side is chosen', async ({ assert }) => {
    const { league, a, b, link } = await seed({ a: { city: 'Reston' } })
    await link(a, 'zain')
    await link(b, 'zain-alt')

    await new PlayerMergeService().merge({
      leagueId: league.id,
      survivorId: a.id,
      mergedId: b.id,
      resolutions: { city: null },
      actorUserId: null,
    })

    const survivor = await LeaguePlayer.findOrFail(a.id)
    assert.isNull(survivor.city)
  })

  test('refuses a conflicting field with no resolution, and takes the one it is given', async ({
    assert,
  }) => {
    const setup = async () => seed({ a: { displayTag: 'Zain' }, b: { displayTag: 'Zain [C9]' } })

    const missing = await setup()
    await missing.link(missing.a, 'zain')
    await missing.link(missing.b, 'zain-alt')
    let caught: unknown
    try {
      await new PlayerMergeService().merge({
        leagueId: missing.league.id,
        survivorId: missing.a.id,
        mergedId: missing.b.id,
        resolutions: {},
        actorUserId: null,
      })
    } catch (error) {
      caught = error
    }
    assert.instanceOf(caught, UnresolvedMergeConflictError)

    const chosen = await setup()
    await chosen.link(chosen.a, 'zain')
    await chosen.link(chosen.b, 'zain-alt')
    await new PlayerMergeService().merge({
      leagueId: chosen.league.id,
      survivorId: chosen.a.id,
      mergedId: chosen.b.id,
      resolutions: { displayTag: 'Zain [C9]' },
      actorUserId: null,
    })
    const survivor = await LeaguePlayer.findOrFail(chosen.a.id)
    assert.equal(survivor.displayTag, 'Zain [C9]')
  })

  test('rejects a resolution that is neither row’s value', async ({ assert }) => {
    const { league, a, b, link } = await seed({
      a: { displayTag: 'Zain' },
      b: { displayTag: 'Zain [C9]' },
    })
    await link(a, 'zain')
    await link(b, 'zain-alt')

    let caught: unknown
    try {
      await new PlayerMergeService().merge({
        leagueId: league.id,
        survivorId: a.id,
        mergedId: b.id,
        resolutions: { displayTag: 'Someone Else' },
        actorUserId: null,
      })
    } catch (error) {
      caught = error
    }
    assert.instanceOf(caught, UnresolvedMergeConflictError)
  })

  test('refuses to reach into another league for either side', async ({ assert }) => {
    const mine = await seed()
    await mine.link(mine.a, 'zain')
    const theirs = await seed()
    await theirs.link(theirs.b, 'other')

    await assert.rejects(() =>
      new PlayerMergeService().merge({
        leagueId: mine.league.id,
        survivorId: mine.a.id,
        mergedId: theirs.b.id,
        resolutions: {},
        actorUserId: null,
      })
    )

    const untouched = await LeaguePlayer.findOrFail(theirs.b.id)
    assert.isNull(untouched.mergedIntoId)
  })

  test('refuses to merge a player into itself', async ({ assert }) => {
    const { league, a } = await seed()

    await assert.rejects(() =>
      new PlayerMergeService().merge({
        leagueId: league.id,
        survivorId: a.id,
        mergedId: a.id,
        resolutions: {},
        actorUserId: null,
      })
    )
  })

  test('marks the league stale so standings are rebuilt on the new mapping', async ({ assert }) => {
    const { league, a, b, link } = await seed()
    await link(a, 'zain')
    await link(b, 'zain-alt')

    const ranking = await Ranking.create({
      leagueId: league.id,
      slug: 'power',
      name: 'Power',
      algorithm: 'elo',
    })

    const leagueBefore = await League.findOrFail(league.id)
    const versionBefore = leagueBefore.identityVersion

    await new PlayerMergeService().merge({
      leagueId: league.id,
      survivorId: a.id,
      mergedId: b.id,
      resolutions: {},
      actorUserId: null,
    })

    const leagueAfter = await League.findOrFail(league.id)
    assert.isAbove(leagueAfter.identityVersion, versionBefore)

    const rankingAfter = await Ranking.findOrFail(ranking.id)
    assert.isNotNull(rankingAfter.recomputeRequestedAt)
  })

  test('preview warns only about events the two players both entered', async ({ assert }) => {
    const { league, a, b, link } = await seed({
      a: { displayTag: 'Zain' },
      b: { displayTag: 'Zain [C9]' },
    })
    const aMapping = await link(a, 'zain')
    const bMapping = await link(b, 'zain-alt')

    await enterEvent(league, 'Genesis', [aMapping.platformAccountId, bMapping.platformAccountId])
    await enterEvent(league, 'Local Weekly', [aMapping.platformAccountId])

    const preview = await new PlayerMergeService().preview({
      leagueId: league.id,
      playerAId: a.id,
      playerBId: b.id,
    })

    assert.lengthOf(preview.sharedEvents, 1)
    assert.equal(preview.sharedEvents[0].label, 'Genesis — Genesis Singles')

    const tagField = preview.fields.find((field) => field.key === 'displayTag')
    assert.equal(tagField?.status, 'conflict')
  })

  /**
   * End-to-end through the form: an empty resolution field is `convertEmptyStrings
   * ToNull`'d to `null` by the bodyparser, the validator accepts it, and the
   * service reads it as "resolve to empty".
   */
  test('an empty resolution field posted from the form clears the value', async ({
    client,
    assert,
  }) => {
    const { league, a, b, link } = await seed({ a: { city: 'Reston' } })
    await link(a, 'zain')
    await link(b, 'zain-alt')

    const owner = await User.create({
      email: `owner-${Math.random()}@example.com`,
      password: 'secret123',
      fullName: 'Owner',
    })
    await LeagueAdmin.create({ leagueId: league.id, userId: owner.id, role: 'owner' })

    const response = await client
      .post(`/${league.slug}/players/merge`)
      .loginAs(owner)
      .withCsrfToken()
      .fields({ survivorId: a.id, mergedId: b.id, city: '' })
      .redirects(0)

    response.assertStatus(302)

    const survivor = await LeaguePlayer.findOrFail(a.id)
    const mergedRow = await LeaguePlayer.findOrFail(b.id)
    assert.isNull(survivor.city)
    assert.equal(mergedRow.mergedIntoId, a.id)
  })
})
