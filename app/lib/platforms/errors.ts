/**
 * The error taxonomy every adapter maps its failures onto.
 *
 * The import pipeline decides whether to retry based only on these classes, so
 * an adapter that misclassifies either burns retries on a hopeless request or
 * gives up on a blip. There are exactly two questions: is trying again later
 * plausibly useful, and is this something the league admin can fix?
 */

export abstract class PlatformError extends Error {
  abstract readonly retryable: boolean

  constructor(
    message: string,
    readonly context: { platform: string; cause?: unknown } & Record<string, unknown>
  ) {
    super(message, { cause: context.cause })
    this.name = new.target.name
  }
}

/**
 * Something that may succeed on a later attempt: network failures, 5xx, rate
 * limiting. `retryAfterMs` is populated when the platform tells us how long to
 * wait, and the pipeline honours it in preference to its own backoff.
 */
export class TransientPlatformError extends PlatformError {
  readonly retryable = true

  constructor(
    message: string,
    context: { platform: string; cause?: unknown; retryAfterMs?: number } & Record<string, unknown>
  ) {
    super(message, context)
  }

  get retryAfterMs(): number | undefined {
    return this.context.retryAfterMs as number | undefined
  }
}

/**
 * Something retrying cannot fix: a bad or expired key, a deleted tournament, a
 * payload we cannot parse. These surface to the league admin, so the message
 * should say what they need to do.
 */
export class PermanentPlatformError extends PlatformError {
  readonly retryable = false
}

/**
 * Default HTTP classification, shared so adapters do not each reinvent it.
 *
 * 401/403 are permanent because they mean the supplied credential is wrong,
 * which no amount of waiting resolves. 408 and 429 are transient. Anything at
 * or above 500 is transient. Other 4xx are permanent.
 */
export function isRetryableHttpStatus(status: number): boolean {
  if (status === 408 || status === 429) return true
  return status >= 500
}

/** Parses a `Retry-After` header in either seconds or HTTP-date form. */
export function parseRetryAfter(header: string | null, now = new Date()): number | undefined {
  if (!header) return undefined

  const seconds = Number(header)
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000)
  }

  const date = Date.parse(header)
  if (Number.isNaN(date)) return undefined

  return Math.max(0, date - now.getTime())
}
