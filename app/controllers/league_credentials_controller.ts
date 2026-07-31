import vine from '@vinejs/vine'
import LeagueCredential from '#models/league_credential'
import { platforms } from '#lib/platforms/registry'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Per-league platform API keys.
 *
 * The form is rendered from each adapter's declared credential fields and
 * validated with its own VineJS schema, so this controller never knows what a
 * particular platform actually needs.
 */
export default class LeagueCredentialsController {
  async index({ league, inertia }: HttpContext) {
    const saved = await LeagueCredential.query().where('leagueId', league.id)
    const savedKeys = new Set(saved.map((row) => row.platformKey))

    return inertia.render('leagues/credentials', {
      league: { slug: league.slug, name: league.name },
      platforms: platforms
        .all()
        .filter((adapter) => adapter.credentials !== null)
        .map((adapter) => ({
          key: adapter.key,
          displayName: adapter.displayName,
          // Values are never sent back to the browser, only whether they exist.
          configured: savedKeys.has(adapter.key),
          fields: adapter.credentials!.fields.map((field) => ({
            name: field.name,
            label: field.label,
            help: field.help ?? null,
            secret: field.secret ?? false,
          })),
        })),
    })
  }

  async update({ league, params, request, response, session }: HttpContext) {
    const adapter = platforms.get(params.platform)
    if (adapter.credentials === null) {
      return response.badRequest({ message: `${adapter.displayName} needs no credentials` })
    }

    const validator = vine.compile(adapter.credentials.schema)
    const values = (await validator.validate(request.all())) as Record<string, string>

    const credential =
      (await LeagueCredential.query()
        .where('leagueId', league.id)
        .where('platformKey', adapter.key)
        .first()) ?? new LeagueCredential()

    credential.leagueId = league.id
    credential.platformKey = adapter.key
    credential.values = values
    await credential.save()

    session.flash('notification', `${adapter.displayName} credentials saved`)
    return response.redirect().toRoute('credentials.index', { league: league.slug })
  }
}
