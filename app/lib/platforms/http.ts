import {
  PermanentPlatformError,
  TransientPlatformError,
  isRetryableHttpStatus,
  parseRetryAfter,
} from '#lib/platforms/errors'
import type { PlatformFetch, RateLimit } from '#lib/platforms/contracts'

export type SleepFn = (ms: number, signal?: AbortSignal) => Promise<void>

const defaultSleep: SleepFn = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true }
    )
  })

export interface PlatformHttpOptions {
  platform: string
  rateLimit: RateLimit
  signal: AbortSignal
  maxAttempts?: number
  /** Injected so tests do not spend real time in backoff. */
  fetch?: typeof globalThis.fetch
  sleep?: SleepFn
  now?: () => number
}

/**
 * Builds the `context.http` function handed to a platform adapter. Adapters
 * never call global fetch, so pacing, retry and error classification are
 * written once, and fixtures can be replayed through the same seam.
 *
 * Pacing is an in-memory token bucket. That suffices because the import
 * pipeline holds an advisory lock per credential, so only one import is ever in
 * flight for a given API key — there is nothing to coordinate across processes.
 */
export function createPlatformHttp(options: PlatformHttpOptions): PlatformFetch {
  const doFetch = options.fetch ?? globalThis.fetch
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? (() => Date.now())
  const maxAttempts = options.maxAttempts ?? 4

  const { requests, perSeconds } = options.rateLimit
  const windowMs = perSeconds * 1000
  const timestamps: number[] = []

  async function pace(): Promise<void> {
    // Drop anything that has aged out of the window.
    const cutoff = now() - windowMs
    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift()
    }

    if (timestamps.length >= requests) {
      const waitFor = timestamps[0] + windowMs - now()
      if (waitFor > 0) {
        await sleep(waitFor, options.signal)
      }
      return pace()
    }

    timestamps.push(now())
  }

  return async function platformFetch(input, init) {
    let attempt = 0

    for (;;) {
      attempt += 1
      options.signal.throwIfAborted()
      await pace()

      let response: Response
      try {
        response = await doFetch(input, { ...init, signal: options.signal })
      } catch (cause) {
        options.signal.throwIfAborted()

        // A transport failure is always worth another try: DNS blips and
        // dropped connections say nothing about whether the request is valid.
        if (attempt >= maxAttempts) {
          throw new TransientPlatformError(`Could not reach ${options.platform}`, {
            platform: options.platform,
            cause,
          })
        }

        await sleep(backoffMs(attempt), options.signal)
        continue
      }

      if (response.ok) {
        return response
      }

      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), new Date(now()))

      if (!isRetryableHttpStatus(response.status)) {
        throw new PermanentPlatformError(
          `${options.platform} rejected the request (${response.status} ${response.statusText})`,
          { platform: options.platform, status: response.status }
        )
      }

      if (attempt >= maxAttempts) {
        throw new TransientPlatformError(
          `${options.platform} kept failing (${response.status} ${response.statusText})`,
          { platform: options.platform, status: response.status, retryAfterMs }
        )
      }

      // The platform's own Retry-After always wins over our backoff curve.
      await sleep(retryAfterMs ?? backoffMs(attempt), options.signal)
    }
  }
}

/** Exponential backoff, capped so a long import cannot stall indefinitely. */
function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), 30_000)
}
