import League from '#models/league'
import LeagueAdmin from '#models/league_admin'
import LeagueEvent from '#models/league_event'
import Ranking from '#models/ranking'
import LeaguePolicy from '#policies/league_policy'
import { LeagueClearingService } from '#services/leagues/league_clearing_service'
import db from '@adonisjs/lucid/services/db'
import { createLeagueValidator, updateLeagueValidator } from '#validators/league'
import { DEFAULT_TIMEZONE, TIMEZONES } from '#lib/geo/timezones'
import { toLocalDate } from '#lib/time/local_date'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Routes carrying a `:league` parameter receive an already-resolved and
 * authorised `ctx.league` from LeagueMiddleware. Every query below derives from
 * it rather than from a slug read off the request.
 */
export default class LeaguesController {
  async index({ auth, inertia }: HttpContext) {
    const user = auth.getUserOrFail()

    const leagues = await League.query()
      .whereIn('id', db.from('league_admins').select('league_id').where('user_id', user.id))
      .orderBy('name')

    return inertia.render('leagues/index', {
      leagues: leagues.map((league) => ({
        slug: league.slug,
        name: league.name,
        visibility: league.visibility,
      })),
    })
  }

  async create({ inertia }: HttpContext) {
    return inertia.render('leagues/create', { timezones: TIMEZONES })
  }

  /** Wrapped in a transaction: a league with no administrator would be unreachable through the UI. */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(createLeagueValidator)

    const league = await db.transaction(async (trx) => {
      const created = await League.create(
        {
          name: payload.name,
          slug: payload.slug,
          description: payload.description ?? null,
          visibility: payload.visibility ?? 'public',
          timezone: payload.timezone ?? null,
          createdByUserId: user.id,
        },
        { client: trx }
      )

      await LeagueAdmin.create(
        { leagueId: created.id, userId: user.id, role: 'owner' },
        { client: trx }
      )

      return created
    })

    return response.redirect().toRoute('leagues.show', { league: league.slug })
  }

  async show({ league, bouncer, inertia }: HttpContext) {
    const events = await LeagueEvent.query()
      .where('leagueId', league.id)
      .preload('event', (query) => query.preload('tournament'))
      .limit(50)

    const rankings = await Ranking.query()
      .where('leagueId', league.id)
      .where('published', true)
      .orderBy('name')

    const zone = league.timezone ?? DEFAULT_TIMEZONE

    return inertia.render('leagues/show', {
      league: {
        slug: league.slug,
        name: league.name,
        description: league.description,
      },
      rankings: rankings.map((ranking) => ({
        slug: ranking.slug,
        name: ranking.name,
        algorithm: ranking.algorithm,
      })),
      events: events
        .map((link) => ({
          id: link.event.id,
          name: link.event.name,
          tournamentName: link.event.tournament.name,
          entryKind: link.event.entryKind,
          gameName: link.event.gameName,
          platformKey: link.event.tournament.platformKey,
          startAt: toLocalDate(link.event.tournament.startAt, zone),
        }))
        .sort((a, b) => (b.startAt ?? '').localeCompare(a.startAt ?? '')),
      // Drives whether admin navigation is shown; the routes enforce it anyway.
      canManage: await bouncer.with(LeaguePolicy).allows('manage', league),
    })
  }

  async edit({ league, bouncer, inertia }: HttpContext) {
    return inertia.render('leagues/settings', {
      league: {
        slug: league.slug,
        name: league.name,
        description: league.description,
        visibility: league.visibility,
        timezone: league.timezone,
      },
      timezones: TIMEZONES,
      canDelete: await bouncer.with(LeaguePolicy).allows('delete', league),
    })
  }

  async update({ league, request, response }: HttpContext) {
    const payload = await request.validateUsing(updateLeagueValidator)

    league.name = payload.name
    league.description = payload.description ?? null
    if (payload.visibility) {
      league.visibility = payload.visibility
    }
    if (payload.timezone !== undefined) {
      league.timezone = payload.timezone
    }
    await league.save()

    return response.redirect().toRoute('leagues.edit', { league: league.slug })
  }

  /** Cascades to tournament links, players, and rankings. */
  async destroy({ league, bouncer, response }: HttpContext) {
    await bouncer.with(LeaguePolicy).authorize('delete', league)
    await league.delete()

    return response.redirect().toRoute('leagues.index')
  }

  /** Wipes rankings, players and imported events; keeps the league, its admins, credentials and game list. */
  async clear({ league, bouncer, response, session }: HttpContext) {
    await bouncer.with(LeaguePolicy).authorize('delete', league)
    await new LeagueClearingService().run(league.id)

    session.flash('success', `Cleared ${league.name}`)

    return response.redirect().toRoute('leagues.edit', { league: league.slug })
  }
}
