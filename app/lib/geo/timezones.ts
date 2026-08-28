/**
 * IANA time zone identifiers a league can pick, sourced from the ICU data
 * bundled with Node rather than a maintained list — it stays current with
 * new zones and DST rule changes for free. `UTC` is added explicitly: it is
 * the fallback for a league that hasn't set one, but ICU's zone enumeration
 * only covers location-based zones and omits it.
 */
export const TIMEZONES: string[] = ['UTC', ...Intl.supportedValuesOf('timeZone')]

const VALID = new Set(TIMEZONES)

export function isValidTimezone(value: string): boolean {
  return VALID.has(value)
}

/** What a tournament date reads back in until a league sets its own. */
export const DEFAULT_TIMEZONE = 'UTC'
