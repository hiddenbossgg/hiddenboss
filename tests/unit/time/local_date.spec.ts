import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { fromLocalDate, toLocalDate } from '#lib/time/local_date'

test.group('local_date', () => {
  test('toLocalDate reads an instant back as the calendar date in a given zone', ({ assert }) => {
    /**
     * A tournament that actually started 6pm Pacific on July 27 — start.gg
     * reports this instant as `2026-07-28T01:00:00Z`, since the evening
     * local start time has already rolled into the next UTC day.
     */
    const instant = DateTime.fromISO('2026-07-28T01:00:00Z')

    assert.equal(toLocalDate(instant, 'America/Los_Angeles'), '2026-07-27')
    assert.equal(toLocalDate(instant, 'UTC'), '2026-07-28')
  })

  test('toLocalDate returns null for a null instant', ({ assert }) => {
    assert.isNull(toLocalDate(null, 'America/Los_Angeles'))
  })

  test('fromLocalDate anchors a date-only string to midnight in a given zone', ({ assert }) => {
    const anchored = fromLocalDate('2026-01-06', 'America/New_York')

    // EST is UTC-5 in January.
    assert.equal(anchored?.toUTC().toISO(), '2026-01-06T05:00:00.000Z')
  })

  test('fromLocalDate returns null for a null date', ({ assert }) => {
    assert.isNull(fromLocalDate(null, 'America/New_York'))
  })

  test('round-trips a date through a zone that shifts the UTC calendar day', ({ assert }) => {
    const zone = 'America/Los_Angeles'
    const anchored = fromLocalDate('2026-07-27', zone)!

    // Midnight Pacific July 27 is still July 27 in UTC (positive local
    // offset from UTC never rolls forward), so this direction is safe even
    // without a zone-aware read — the bug this module fixes is one-sided.
    assert.equal(toLocalDate(anchored, zone), '2026-07-27')
  })
})
