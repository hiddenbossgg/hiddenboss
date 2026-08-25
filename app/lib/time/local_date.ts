import { DateTime } from 'luxon'

/**
 * Reads an instant back as the calendar date it falls on in a given zone.
 *
 * A stored timestamp is a correct instant regardless of zone, but "the date"
 * a tournament happened on is only meaningful relative to somewhere — an
 * evening-local tournament's instant has often already rolled into the next
 * day in UTC.
 */
export function toLocalDate(instant: DateTime | null, timezone: string): string | null {
  if (!instant) return null
  return instant.setZone(timezone).toISODate()
}

/** The inverse: anchors a date-only string to midnight in a given zone, for storage as an instant. */
export function fromLocalDate(date: string | null, timezone: string): DateTime | null {
  if (!date) return null
  return DateTime.fromISO(date, { zone: timezone })
}
