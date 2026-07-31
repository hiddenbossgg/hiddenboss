/**
 * parry.gg's JSON gateway over its gRPC services.
 *
 * The published client is gRPC-web, which brings its own transport and so could
 * not go through `context.http` — no rate limiting, no retries, no offline
 * fixtures. The JSON gateway is the same API over ordinary HTTP POST, which
 * keeps every one of those.
 *
 * https://developer.parry.gg/docs/getting-started/json-http-api
 */
export const ENDPOINT = 'https://grpcweb.parry.gg'

/** Every method is a POST to `/parrygg.services.{Service}/{Method}`. */
export function methodUrl(service: string, method: string): string {
  return `${ENDPOINT}/parrygg.services.${service}/${method}`
}

/**
 * proto3 omits fields that hold their default value, so a JSON response has no
 * key at all for a zero score, a round of 0, `winnersSide: false`, or the first
 * slot's `slot: 0`. Reading them as "missing" rather than "zero" is the single
 * easiest way to get this API wrong.
 */
export function int(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

export function bool(value: unknown): boolean {
  return value === true
}

/** Timestamps arrive as RFC 3339 strings rather than `{seconds}` over JSON. */
export function timestamp(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length === 0) return null

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
