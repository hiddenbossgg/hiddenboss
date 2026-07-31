import { readFile } from 'node:fs/promises'
import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import EventImport from '#models/event_import'
import League from '#models/league'
import { IdentityResolverService } from '#services/identity/identity_resolver_service'
import { EventImporterService } from '#services/imports/event_importer_service'
import { platforms } from '#lib/platforms/registry'
import { registerPlatforms } from '#lib/platforms/registry_setup'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Imports one event synchronously, with no queue or worker involved.
 *
 * This is the payoff for keeping import logic in a service rather than inside a
 * job: the same code path is reachable from the CLI, and a failure surfaces
 * here immediately instead of in a worker log.
 */
export default class ImportTournament extends BaseCommand {
  static commandName = 'import:event'
  static description = 'Import one event into a league, synchronously'

  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'League slug' })
  declare league: string

  @args.string({ description: 'Tournament URL, or a slug when importing a CSV' })
  declare target: string

  @flags.string({ description: 'Entrants CSV file; switches to a manual import' })
  declare entrants: string

  @flags.string({ description: 'Sets CSV file, for a manual import' })
  declare sets: string

  @flags.string({ description: 'Tournament name, for a manual import' })
  declare name: string

  /**
   * Without a date a manual import produces no rating deltas or standings at
   * all, since both are plotted against time.
   */
  @flags.string({ description: 'Tournament date (YYYY-MM-DD), for a manual import' })
  declare date: string

  async run() {
    registerPlatforms()

    const league = await League.findBy('slug', this.league)
    if (!league) {
      this.logger.error(`No league with slug "${this.league}"`)
      this.exitCode = 1
      return
    }

    const eventImport = this.entrants
      ? await this.manualImport(league.id)
      : await this.urlImport(league.id, this.target)

    if (!eventImport) {
      this.exitCode = 1
      return
    }

    try {
      const finished = await new EventImporterService().run({
        eventImportId: eventImport.id,
      })

      const identity = await new IdentityResolverService().run({
        leagueId: league.id,
        eventId: finished.eventId!,
      })

      const counts = (finished.stats ?? {}) as { entrants?: number; sets?: number }

      this.logger.success(
        `Imported into ${league.name}: ${finished.bracketsDone} brackets, ` +
          `${counts.entrants ?? 0} entrants, ${counts.sets ?? 0} sets, ` +
          `${identity.created} new players, ${identity.mapped} matched`
      )

      if (finished.emptyWarning) {
        this.logger.warning(finished.emptyWarning)
      }
    } catch (error) {
      this.logger.error((error as Error).message)
      this.exitCode = 1
    }
  }

  private async urlImport(leagueId: string, url: string) {
    const resolved = platforms.resolveUrl(url)
    if (!resolved) {
      this.logger.error(`No supported platform recognises ${url}`)
      return null
    }

    return EventImport.create({
      leagueId,
      platformKey: resolved.adapter.key,
      targetUrl: url,
      status: 'queued',
    })
  }

  private async manualImport(leagueId: string) {
    return EventImport.create({
      leagueId,
      platformKey: 'manual',
      status: 'queued',
      payload: {
        name: this.name ?? this.target,
        slug: this.target,
        ...(this.date ? { startAt: this.date } : {}),
        entrants: await readFile(this.entrants, 'utf8'),
        ...(this.sets ? { sets: await readFile(this.sets, 'utf8') } : {}),
      },
    })
  }
}
