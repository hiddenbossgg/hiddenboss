import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import router from '@adonisjs/core/services/router'
import testUtils from '@adonisjs/core/services/test_utils'
import League from '#models/league'
import LeagueAdmin from '#models/league_admin'
import User from '#models/user'
import { RESERVED_LEAGUE_SLUGS } from '#validators/league'

/**
 * Enforces league scoping across the whole route table.
 *
 * These tests discover routes from the router rather than listing them, so a
 * new `/:league` route is covered the moment it is registered. A leak becomes
 * a failing test instead of something to catch in review.
 */

interface DiscoveredRoute {
  pattern: string
  method: string
  requiresAuth: boolean
}

function middlewareNames(route: { middleware: { all(): Set<unknown> } }): string[] {
  return [...route.middleware.all()]
    .map((entry) => (typeof entry === 'object' && entry !== null ? (entry as any).name : undefined))
    .filter((name): name is string => typeof name === 'string')
}

function leagueRoutes(): DiscoveredRoute[] {
  const discovered: DiscoveredRoute[] = []

  for (const route of router.toJSON().root ?? []) {
    const names = middlewareNames(route)
    if (!names.includes('league')) continue

    for (const method of route.methods) {
      // HEAD is registered alongside GET and runs the same handler.
      if (method === 'HEAD') continue
      discovered.push({
        pattern: route.pattern,
        method,
        requiresAuth: names.includes('auth'),
      })
    }
  }

  return discovered
}

/**
 * A request is properly rejected if it did not succeed.
 *
 * A redirect to the login page counts, because `auth` middleware runs before
 * league resolution and bounces anonymous visitors there. Any other redirect
 * does not: that would mean the request was handled, which for a mutating
 * route means it went through.
 */
function assertRejected(
  assert: Assert,
  response: { status(): number; header(name: string): string | undefined },
  description: string
) {
  const status = response.status()

  if (status >= 300 && status < 400) {
    assert.equal(response.header('location'), '/login', `${description} (unexpected redirect)`)
    return
  }

  assert.isAbove(status, 399, description)
}

async function makeLeague(visibility: 'public' | 'private') {
  const owner = await User.create({
    email: `owner-${visibility}@example.com`,
    password: 'secret123',
    fullName: 'Owner',
  })

  const league = await League.create({
    slug: `scoped-${visibility}`,
    name: `Scoped ${visibility}`,
    visibility,
  })

  await LeagueAdmin.create({ leagueId: league.id, userId: owner.id, role: 'owner' })

  return { owner, league }
}

test.group('league scoping', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('the route table actually contains league-scoped routes', ({ assert }) => {
    // Guards against the discovery above silently matching nothing, which
    // would make every test in this group vacuously pass.
    assert.isAbove(leagueRoutes().length, 0)
  })

  test('a private league is invisible to a signed-in non-member', async ({ client, assert }) => {
    const { league } = await makeLeague('private')
    const outsider = await User.create({
      email: 'outsider@example.com',
      password: 'secret123',
      fullName: 'Outsider',
    })

    for (const route of leagueRoutes()) {
      const path = route.pattern.replace(':league', league.slug)
      const response = await client
        .request(path, route.method)
        .loginAs(outsider)
        .withCsrfToken()
        .redirects(0)

      assertRejected(
        assert,
        response,
        `${route.method} ${path} leaked a private league to a non-member`
      )
    }
  })

  test('a private league is invisible to anonymous visitors', async ({ client, assert }) => {
    const { league } = await makeLeague('private')

    for (const route of leagueRoutes()) {
      const path = route.pattern.replace(':league', league.slug)
      const response = await client.request(path, route.method).withCsrfToken().redirects(0)

      assertRejected(
        assert,
        response,
        `${route.method} ${path} leaked a private league to an anonymous visitor`
      )
    }
  })

  test('admin routes on a public league reject a non-member', async ({ client, assert }) => {
    const { league } = await makeLeague('public')
    const outsider = await User.create({
      email: 'outsider-public@example.com',
      password: 'secret123',
      fullName: 'Outsider',
    })

    const adminRoutes = leagueRoutes().filter((route) => route.requiresAuth)
    assert.isAbove(adminRoutes.length, 0)

    for (const route of adminRoutes) {
      const path = route.pattern.replace(':league', league.slug)
      const response = await client
        .request(path, route.method)
        .loginAs(outsider)
        .withCsrfToken()
        .redirects(0)

      assertRejected(
        assert,
        response,
        `${route.method} ${path} allowed a non-member to administer a league`
      )
    }
  })

  test('a private league is missing, not forbidden, so its existence stays hidden', async ({
    client,
  }) => {
    const { league } = await makeLeague('private')

    const response = await client.get(`/${league.slug}`).redirects(0)
    response.assertStatus(404)
  })

  test('an owner can reach their own league admin pages', async ({ client }) => {
    const { owner, league } = await makeLeague('public')

    const response = await client.get(`/${league.slug}/settings`).loginAs(owner).redirects(0)
    response.assertStatus(200)
  })

  test('a public league home is readable anonymously', async ({ client }) => {
    const { league } = await makeLeague('public')

    const response = await client.get(`/${league.slug}`).redirects(0)
    response.assertStatus(200)
  })

  test('an unknown league slug is a 404', async ({ client }) => {
    const response = await client.get('/does-not-exist').redirects(0)
    response.assertStatus(404)
  })

  /**
   * Leagues live at the root, so `:league` would swallow any literal top-level
   * path that were matched first. Registration order keeps the literals winning,
   * which means the danger is the other way round: a league slugged `login` gets
   * created and is then unreachable forever.
   *
   * Derived from the router rather than listed, so adding a top-level route
   * without reserving its name fails here instead of in production.
   */
  test('every literal top-level path is a reserved league slug', ({ assert }) => {
    const unreserved = new Set<string>()

    for (const route of router.toJSON().root ?? []) {
      const [first] = route.pattern.split('/').filter(Boolean)

      // The root itself, and the league group's own parameter, are not literals.
      if (!first || first.startsWith(':') || first.startsWith('*')) continue
      if (!RESERVED_LEAGUE_SLUGS.includes(first)) unreserved.add(first)
    }

    assert.deepEqual(
      [...unreserved],
      [],
      'add these to RESERVED_LEAGUE_SLUGS or a league taking the name becomes unreachable'
    )
  })
})
