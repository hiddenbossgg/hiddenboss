import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import League from '#models/league'
import LeagueAdmin from '#models/league_admin'
import PlatformAccount from '#models/platform_account'
import User from '#models/user'

test.group('models', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('assigns a sortable uuid primary key on create', async ({ assert }) => {
    const first = await League.create({ slug: 'first', name: 'First' })
    const second = await League.create({ slug: 'second', name: 'Second' })

    assert.match(first.id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/)
    // v7 ids embed a timestamp, so creation order is lexical order.
    assert.isTrue(second.id > first.id)
  })

  test('updates locate the row by its self-assigned key', async ({ assert }) => {
    const league = await League.create({ slug: 'update-me', name: 'Before' })

    league.name = 'After'
    await league.save()

    const reloaded = await League.findOrFail(league.id)
    assert.equal(reloaded.name, 'After')
  })

  test('deletes locate the row by its self-assigned key', async ({ assert }) => {
    const league = await League.create({ slug: 'delete-me', name: 'Doomed' })
    await league.delete()

    assert.isNull(await League.find(league.id))
  })

  test('relations resolve across uuid foreign keys', async ({ assert }) => {
    const user = await User.create({
      email: 'to@example.com',
      password: 'secret123',
      fullName: 'Tournament Organiser',
    })
    const league = await League.create({ slug: 'relations', name: 'Relations' })
    await LeagueAdmin.create({ leagueId: league.id, userId: user.id, role: 'owner' })

    await league.load('admins')
    assert.lengthOf(league.admins, 1)

    await league.admins[0].load('user')
    assert.equal(league.admins[0].user.email, 'to@example.com')
  })

  test('citext slugs compare case-insensitively', async ({ assert }) => {
    await League.create({ slug: 'CaseTest', name: 'Case Test' })

    const found = await League.findBy('slug', 'casetest')
    assert.isNotNull(found)
  })

  test('normalizes gamertags for fuzzy matching', ({ assert }) => {
    assert.equal(PlatformAccount.normalizeTag('TSM | Leffen'), 'leffen')
    assert.equal(PlatformAccount.normalizeTag('  Zain  '), 'zain')
    assert.equal(PlatformAccount.normalizeTag('Mang0'), 'mang0')
  })

  test('jsonb columns round-trip as objects', async ({ assert }) => {
    const league = await League.create({
      slug: 'themed',
      name: 'Themed',
      theme: { accent: '#ff0055' },
    })

    const reloaded = await League.findOrFail(league.id)
    assert.deepEqual(reloaded.theme, { accent: '#ff0055' })
  })
})
