import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import logger from '@adonisjs/core/services/logger'
import { platforms } from '#lib/platforms/registry'
import { registerPlatforms } from '#lib/platforms/registry_setup'
import { createPlatformHttp } from '#lib/platforms/http'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { RecordingSink } from '#lib/platforms/recording_sink'
import type { PlatformFetch } from '#lib/platforms/contracts'

/**
 * Keys a recorded response by the request that produced it. The replay harness
 * uses the identical function, so a fixture cannot drift from its request.
 */
export function requestKey(input: string, init?: RequestInit): string {
  const body = typeof init?.body === 'string' ? init.body : ''
  return createHash('sha256')
    .update(`${init?.method ?? 'GET'} ${input} ${body}`)
    .digest('hex')
    .slice(0, 32)
}

/**
 * Records real platform responses to disk so adapter tests replay them offline.
 *
 * This is the only place a real API token is ever needed. Once fixtures are
 * committed the suite runs with no credentials and no network, which is what
 * lets somebody without a key for a platform still review and change its
 * adapter.
 */
export default class RecordPlatformFixtures extends BaseCommand {
  static commandName = 'record:platform-fixtures'
  static description = 'Record real platform API responses as test fixtures'

  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Platform key, e.g. startgg' })
  declare platform: string

  @args.string({ description: 'Tournament URL to record' })
  declare url: string

  @flags.string({ description: 'Credential values as JSON, e.g. {"token":"..."}' })
  declare credentials: string

  async run() {
    registerPlatforms()

    const adapter = platforms.get(this.platform)
    const ref = adapter.matchUrl(this.url)

    if (!ref) {
      this.logger.error(`${adapter.displayName} does not recognise ${this.url}`)
      this.exitCode = 1
      return
    }

    const credentials = this.credentials ? JSON.parse(this.credentials) : {}
    const directory = this.app.makePath('tests', 'fixtures', 'platforms', adapter.key)
    await mkdir(directory, { recursive: true })

    const controller = new AbortController()
    const live = createPlatformHttp({
      platform: adapter.key,
      rateLimit: adapter.rateLimit,
      signal: controller.signal,
    })

    let recordedCount = 0

    /**
     * Recording through the same `context.http` seam the adapter uses in
     * production is what guarantees the fixtures match real traffic.
     */
    const recording: PlatformFetch = async (input, init) => {
      const response = await live(input, init)
      const body = await response.clone().text()

      await writeFile(
        join(directory, `${requestKey(input, init)}.json`),
        JSON.stringify(
          {
            request: { url: input, method: init?.method ?? 'GET', body: init?.body ?? null },
            status: response.status,
            body: JSON.parse(body),
          },
          null,
          2
        )
      )

      recordedCount += 1
      return response
    }

    const sink = new RecordingSink()

    try {
      await adapter.fetchEvent(
        ref,
        { credentials, http: recording, signal: controller.signal, logger },
        sink
      )
    } catch (error) {
      this.logger.error(`Recording failed: ${(error as Error).message}`)
      this.exitCode = 1
      return
    }

    /**
     * Appended rather than overwritten: an import covers one event, so a
     * platform's fixtures usually span several recordings. Response files are
     * keyed by request hash, so they merge without collision.
     */
    const manifestPath = join(directory, 'manifest.json')
    const existing = await readManifest(manifestPath)
    const events = existing.events.filter((event) => event.url !== this.url)
    events.push({ url: this.url, slug: ref.slug })

    await writeFile(
      manifestPath,
      JSON.stringify({ events, requests: existing.requests + recordedCount }, null, 2)
    )

    this.logger.success(
      `Recorded ${recordedCount} responses and ${sink.calls.length} records into ${directory}`
    )
    this.logger.info('Review the files for anything private before committing them.')
  }
}

interface FixtureManifest {
  events: Array<{ url: string; slug: string }>
  requests: number
}

async function readManifest(path: string): Promise<FixtureManifest> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<FixtureManifest>
    return { events: parsed.events ?? [], requests: parsed.requests ?? 0 }
  } catch {
    return { events: [], requests: 0 }
  }
}
