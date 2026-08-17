import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from '@adonisjs/core/services/logger'
import { requestKey } from '../../../commands/record_platform_fixtures.js'
import type { PlatformContext, PlatformFetch } from '#lib/platforms/contracts'

/**
 * `.pathname` on a `file://` URL is wrong on Windows — it leaves the leading
 * slash in front of the drive letter (`/C:/...`), which then resolves to a
 * doubled drive (`C:\C:\...`) once joined with another path. `fileURLToPath`
 * is the correct way to turn a module URL into a filesystem path.
 */
const FIXTURE_ROOT = fileURLToPath(new URL('../../fixtures/platforms/', import.meta.url))

/**
 * Replays recorded platform responses.
 *
 * Requests are matched by the same hash the recorder writes, so a fixture can
 * never silently answer a different question than the one it was recorded for.
 * An unmatched request fails loudly rather than returning an empty body, which
 * would otherwise show up as a confusing parse error much later.
 */
export async function fixtureHttp(platform: string): Promise<PlatformFetch> {
  const directory = join(FIXTURE_ROOT, platform)
  const files = await readdir(directory)
  const responses = new Map<string, { status: number; body: unknown }>()

  for (const file of files) {
    if (!file.endsWith('.json') || file === 'manifest.json') continue

    const contents = JSON.parse(await readFile(join(directory, file), 'utf8'))
    responses.set(file.replace(/\.json$/, ''), contents)
  }

  return async (input, init) => {
    const key = requestKey(input, init)
    const recorded = responses.get(key)

    if (!recorded) {
      throw new Error(
        `No recorded response for ${init?.method ?? 'GET'} ${input}.\n` +
          `Re-record with: node ace record:platform-fixtures ${platform} <url> --credentials='{...}'`
      )
    }

    return new Response(JSON.stringify(recorded.body), {
      status: recorded.status,
      headers: { 'content-type': 'application/json' },
    })
  }
}

export async function fixtureContext(platform: string): Promise<PlatformContext> {
  return {
    credentials: { token: 'recorded-fixture-token' },
    http: await fixtureHttp(platform),
    signal: new AbortController().signal,
    logger,
  }
}

/** Whether fixtures have been recorded for a platform yet. */
export async function hasFixtures(platform: string): Promise<boolean> {
  try {
    const files = await readdir(join(FIXTURE_ROOT, platform))
    return files.some((file) => file.endsWith('.json') && file !== 'manifest.json')
  } catch {
    return false
  }
}
