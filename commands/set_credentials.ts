import vine from '@vinejs/vine'
import { BaseCommand, args } from '@adonisjs/core/ace'
import League from '#models/league'
import LeagueCredential from '#models/league_credential'
import { platforms } from '#lib/platforms/registry'
import { registerPlatforms } from '#lib/platforms/registry_setup'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Stores a league's API credentials for a platform.
 *
 * Values are validated with the adapter's own schema, so a malformed key is
 * rejected here rather than surfacing as an opaque 401 mid-import.
 *
 * Pass the value through a shell variable rather than typing it inline, so the
 * key does not land in shell history:
 *
 *   node ace credentials:set dev-league startgg "{\"token\":\"$STARTGG_TOKEN\"}"
 */
export default class SetCredentials extends BaseCommand {
  static commandName = 'credentials:set'
  static description = "Store a league's API credentials for a platform"

  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'League slug' })
  declare league: string

  @args.string({ description: 'Platform key, e.g. startgg' })
  declare platform: string

  @args.string({ description: 'Credential values as JSON' })
  declare values: string

  async run() {
    registerPlatforms()

    const league = await League.findBy('slug', this.league)
    if (!league) {
      this.logger.error(`No league with slug "${this.league}"`)
      this.exitCode = 1
      return
    }

    const adapter = platforms.get(this.platform)
    if (adapter.credentials === null) {
      this.logger.error(`${adapter.displayName} needs no credentials`)
      this.exitCode = 1
      return
    }

    const validator = vine.compile(adapter.credentials.schema)
    const values = (await validator.validate(JSON.parse(this.values))) as Record<string, string>

    const credential =
      (await LeagueCredential.query()
        .where('leagueId', league.id)
        .where('platformKey', adapter.key)
        .first()) ?? new LeagueCredential()

    credential.leagueId = league.id
    credential.platformKey = adapter.key
    credential.values = values
    await credential.save()

    this.logger.success(`Stored ${adapter.displayName} credentials for ${league.name}`)
  }
}
