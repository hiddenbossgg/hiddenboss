import League from '#models/league'
import LeaguePolicy from '#policies/league_policy'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Resolves the `:league` route parameter, authorises it, and puts it on the
 * HTTP context.
 *
 * Controllers must derive every query from `ctx.league`, never from a slug read
 * off the request. Scoping lives here so that a controller mounted without this
 * middleware has no league to work from, and fails loudly rather than serving
 * another league's data.
 */
export default class LeagueMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: { authorize?: 'view' | 'manage' } = {}) {
    const slug = ctx.params.league
    const league = await League.findBy('slug', slug)

    if (!league) {
      return ctx.response.notFound({ message: `No league found for "${slug}"` })
    }

    /**
     * A private league must be indistinguishable from a missing one to
     * somebody who cannot see it, otherwise a 403 confirms it exists.
     */
    const action = options.authorize ?? 'view'
    if (!(await ctx.bouncer.with(LeaguePolicy).allows(action, league))) {
      if (action === 'view') {
        return ctx.response.notFound({ message: `No league found for "${slug}"` })
      }

      return ctx.response.forbidden({ message: 'You do not administer this league' })
    }

    ctx.league = league
    return next()
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    /**
     * The league for this request, resolved and authorised by
     * LeagueMiddleware. Only present on routes that use it.
     */
    league: League
  }
}
