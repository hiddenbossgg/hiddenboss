import vine from '@vinejs/vine'
import EventImport from '#models/event_import'
import ImportEventJob from '#jobs/import_event_job'
import { platforms } from '#lib/platforms/registry'
import type { HttpContext } from '@adonisjs/core/http'

const importValidator = vine.create({
  url: vine.string().trim().url(),
})

/**
 * Starting and monitoring imports.
 *
 * Nothing here names a platform: the registry decides which adapter owns a
 * pasted link, so supporting a new one requires no change to this file.
 */
export default class ImportsController {
  async index({ league, inertia }: HttpContext) {
    const imports = await EventImport.query()
      .where('leagueId', league.id)
      .preload('tournament')
      .preload('event')
      .orderBy('createdAt', 'desc')
      .limit(25)

    return inertia.render('leagues/imports', {
      league: { slug: league.slug, name: league.name },
      platforms: platforms.all().map((adapter) => ({
        key: adapter.key,
        displayName: adapter.displayName,
        needsCredentials: adapter.credentials !== null,
      })),
      imports: imports.map((record) => ({
        id: record.id,
        platformKey: record.platformKey,
        /** Manual imports have no URL, so fall back to what was imported. */
        label: record.event?.name
          ? `${record.tournament?.name ?? ''} — ${record.event.name}`.replace(/^ — /, '')
          : (record.tournament?.name ?? record.targetUrl ?? 'Pending'),
        eventId: record.eventId,
        targetUrl: record.targetUrl,
        status: record.status,
        stage: record.stage,
        bracketsDone: record.bracketsDone,
        bracketsTotal: record.bracketsTotal,
        error: record.error,
        warning: record.emptyWarning,
        counts: record.stats as { entrants?: number; sets?: number } | null,
      })),
    })
  }

  /**
   * Accepts an event link, works out which platform owns it, and queues the
   * import. A link naming a whole tournament is recognised here and rejected by
   * the adapter, which can say which events it holds.
   */
  async store({ league, auth, request, response, session }: HttpContext) {
    const { url } = await request.validateUsing(importValidator)

    const resolved = platforms.resolveUrl(url)
    if (!resolved) {
      session.flash('errors', { url: 'No supported platform recognises that link.' })
      return response.redirect().back()
    }

    const eventImport = await EventImport.create({
      leagueId: league.id,
      platformKey: resolved.adapter.key,
      targetUrl: url,
      status: 'queued',
      createdByUserId: auth.getUserOrFail().id,
    })

    await ImportEventJob.dispatch({ eventImportId: eventImport.id })

    return response.redirect().toRoute('imports.index', { league: league.slug })
  }
}
