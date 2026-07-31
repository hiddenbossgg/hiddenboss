import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import IdentityEvent from '#models/identity_event'
import League from '#models/league'
import LeaguePlayer from '#models/league_player'
import LeaguePlayerAccount from '#models/league_player_account'
import PlatformAccount from '#models/platform_account'
import Ranking from '#models/ranking'
import { IdentityCorrectionService } from '#services/identity/identity_correction_service'

/**
 * Corrections are the other half of automatic resolution: it errs towards
 * splitting, and this puts the halves back together. Every case here is about
 * the correction staying reversible and staying inside its league.
 */
test.group('identity correction', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function seed(leagueSlug = 'corrections') {
    const league = await League.create({ slug: leagueSlug, name: leagueSlug })

    const account = await PlatformAccount.create({
      platformKey: 'startgg',
      externalUserId: `user-${leagueSlug}`,
      gamerTag: 'Mayz',
      normalizedTag: 'mayz',
      weakIdentity: false,
    })

    const from = await LeaguePlayer.create({
      leagueId: league.id,
      slug: 'mayz',
      displayTag: 'Mayz',
    })

    const to = await LeaguePlayer.create({
      leagueId: league.id,
      slug: 'mayz-2',
      displayTag: 'Mayz',
    })

    const mapping = await LeaguePlayerAccount.create({
      leagueId: league.id,
      leaguePlayerId: from.id,
      platformAccountId: account.id,
      source: 'auto',
    })

    return { league, account, from, to, mapping }
  }

  test('moves the account and records who did it', async ({ assert }) => {
    const { league, account, from, to } = await seed()

    const result = await new IdentityCorrectionService().reassign({
      leagueId: league.id,
      platformAccountId: account.id,
      target: { existingPlayerId: to.id },
      actorUserId: null,
    })

    assert.equal(result.from, from.id)
    assert.equal(result.to, to.id)

    const mapping = await LeaguePlayerAccount.query()
      .where('platformAccountId', account.id)
      .firstOrFail()

    assert.equal(mapping.leaguePlayerId, to.id)
    // Manual beats anything automatic, so re-resolution cannot undo it.
    assert.equal(mapping.source, 'manual')
    assert.isFalse(mapping.provisional)
  })

  /**
   * The emptied player is kept rather than deleted. That is what makes a merge
   * reversible, and what keeps its URLs resolving to whoever absorbed it.
   */
  test('tombstones a player left with no accounts', async ({ assert }) => {
    const { league, account, from, to } = await seed()

    const result = await new IdentityCorrectionService().reassign({
      leagueId: league.id,
      platformAccountId: account.id,
      target: { existingPlayerId: to.id },
      actorUserId: null,
    })

    assert.equal(result.tombstoned, from.id)

    const reloaded = await LeaguePlayer.findOrFail(from.id)
    assert.equal(reloaded.mergedIntoId, to.id)
  })

  test('leaves a player alone while it still holds another account', async ({ assert }) => {
    const { league, account, from, to } = await seed()

    const second = await PlatformAccount.create({
      platformKey: 'startgg',
      externalUserId: 'user-second',
      gamerTag: 'Mayz',
      normalizedTag: 'mayz',
      weakIdentity: false,
    })
    await LeaguePlayerAccount.create({
      leagueId: league.id,
      leaguePlayerId: from.id,
      platformAccountId: second.id,
      source: 'auto',
    })

    const result = await new IdentityCorrectionService().reassign({
      leagueId: league.id,
      platformAccountId: account.id,
      target: { existingPlayerId: to.id },
      actorUserId: null,
    })

    assert.isNull(result.tombstoned)
    const reloaded = await LeaguePlayer.findOrFail(from.id)
    assert.isNull(reloaded.mergedIntoId)
  })

  test('appends to the audit log so the change can be undone', async ({ assert }) => {
    const { league, account, from, to } = await seed()

    await new IdentityCorrectionService().reassign({
      leagueId: league.id,
      platformAccountId: account.id,
      target: { existingPlayerId: to.id },
      actorUserId: null,
    })

    const events = await IdentityEvent.query().where('leagueId', league.id)
    assert.lengthOf(events, 1)
    assert.equal(events[0].kind, 'merge')
    assert.deepInclude(events[0].payload, {
      platformAccountId: account.id,
      fromLeaguePlayerId: from.id,
      toLeaguePlayerId: to.id,
    })
  })

  /** Standings were built on the old mapping, so they cannot be trusted after. */
  test('marks the league stale so standings get rebuilt', async ({ assert }) => {
    const { league, account, to } = await seed()

    const ranking = await Ranking.create({
      leagueId: league.id,
      slug: 'power',
      name: 'Power',
      algorithm: 'elo',
    })

    const initial = await League.findOrFail(league.id)
    const before = initial.identityVersion

    await new IdentityCorrectionService().reassign({
      leagueId: league.id,
      platformAccountId: account.id,
      target: { existingPlayerId: to.id },
      actorUserId: null,
    })

    const after = await League.findOrFail(league.id)
    assert.isAbove(after.identityVersion, before)

    const reloadedRanking = await Ranking.findOrFail(ranking.id)
    assert.isNotNull(reloadedRanking.recomputeRequestedAt)
  })

  /**
   * The case an automated test of mine got wrong by hand: a correction must not
   * be able to point one league's account at another league's player.
   */
  test('refuses a target player from another league', async ({ assert }) => {
    const mine = await seed('mine')
    const theirs = await seed('theirs')

    await assert.rejects(() =>
      new IdentityCorrectionService().reassign({
        leagueId: mine.league.id,
        platformAccountId: mine.account.id,
        target: { existingPlayerId: theirs.to.id },
        actorUserId: null,
      })
    )

    const mapping = await LeaguePlayerAccount.query()
      .where('platformAccountId', mine.account.id)
      .firstOrFail()

    assert.equal(mapping.leaguePlayerId, mine.from.id, 'the mapping is untouched')
  })

  /**
   * Splitting is the only fix for one player holding two people, because there
   * is no existing row to reassign to.
   */
  test('splits an account out into a player created for it', async ({ assert }) => {
    const { league, account, from } = await seed()

    /** A second account keeps `from` alive, so this is a split rather than a move. */
    const second = await PlatformAccount.create({
      platformKey: 'startgg',
      externalUserId: 'user-sharing-a-row',
      gamerTag: 'Mayz',
      normalizedTag: 'mayz',
      weakIdentity: false,
    })
    await LeaguePlayerAccount.create({
      leagueId: league.id,
      leaguePlayerId: from.id,
      platformAccountId: second.id,
      source: 'auto',
    })

    const result = await new IdentityCorrectionService().reassign({
      leagueId: league.id,
      platformAccountId: account.id,
      target: { newPlayerTag: 'Not Mayz' },
      actorUserId: null,
    })

    assert.isNotNull(result.created)
    assert.equal(result.to, result.created)
    assert.isNull(result.tombstoned, 'the old player still holds the other account')

    const created = await LeaguePlayer.findOrFail(result.created!)
    assert.equal(created.displayTag, 'Not Mayz')
    assert.equal(created.leagueId, league.id)
    assert.isNull(created.mergedIntoId)

    const mapping = await LeaguePlayerAccount.query()
      .where('platformAccountId', account.id)
      .firstOrFail()
    assert.equal(mapping.leaguePlayerId, created.id)
    assert.equal(mapping.source, 'manual')
  })

  /** Slugs are public URLs and unique per league, so a clash gets a suffix. */
  test('gives a new player a free slug when the name is taken', async ({ assert }) => {
    const { league, account } = await seed()

    const result = await new IdentityCorrectionService().reassign({
      leagueId: league.id,
      platformAccountId: account.id,
      target: { newPlayerTag: 'Mayz' },
      actorUserId: null,
    })

    const created = await LeaguePlayer.findOrFail(result.created!)
    assert.notEqual(created.slug, 'mayz', 'that slug already belongs to another player')

    const sharing = await LeaguePlayer.query().where('leagueId', league.id).where('slug', 'mayz')
    assert.lengthOf(sharing, 1)
  })

  test('logs a split as a split, not a merge', async ({ assert }) => {
    const { league, account, from } = await seed()

    const result = await new IdentityCorrectionService().reassign({
      leagueId: league.id,
      platformAccountId: account.id,
      target: { newPlayerTag: 'Someone Else' },
      actorUserId: null,
    })

    const events = await IdentityEvent.query().where('leagueId', league.id)
    assert.lengthOf(events, 1)
    assert.equal(events[0].kind, 'split')
    assert.deepInclude(events[0].payload, {
      platformAccountId: account.id,
      fromLeaguePlayerId: from.id,
      toLeaguePlayerId: result.created,
      createdLeaguePlayerId: result.created,
    })
  })

  test('is a no-op when the account already belongs to the target', async ({ assert }) => {
    const { league, account, from } = await seed()

    const result = await new IdentityCorrectionService().reassign({
      leagueId: league.id,
      platformAccountId: account.id,
      target: { existingPlayerId: from.id },
      actorUserId: null,
    })

    assert.isNull(result.tombstoned)
    assert.lengthOf(await IdentityEvent.query().where('leagueId', league.id), 0)
  })
})
