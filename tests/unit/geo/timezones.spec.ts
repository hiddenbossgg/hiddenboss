import { test } from '@japa/runner'
import { DEFAULT_TIMEZONE, isValidTimezone, TIMEZONES } from '#lib/geo/timezones'

test.group('timezones', () => {
  test('recognises a real IANA identifier', ({ assert }) => {
    assert.isTrue(isValidTimezone('America/New_York'))
  })

  test('recognises UTC even though ICU omits it from the zone list', ({ assert }) => {
    assert.isTrue(isValidTimezone('UTC'))
  })

  test('rejects a made-up zone', ({ assert }) => {
    assert.isFalse(isValidTimezone('Mars/Olympus_Mons'))
  })

  test('rejects an offset string rather than a zone name', ({ assert }) => {
    assert.isFalse(isValidTimezone('-08:00'))
  })

  test('the default is UTC and is itself a valid choice', ({ assert }) => {
    assert.equal(DEFAULT_TIMEZONE, 'UTC')
    assert.isTrue(isValidTimezone(DEFAULT_TIMEZONE))
  })

  test('the list has no duplicates', ({ assert }) => {
    assert.equal(new Set(TIMEZONES).size, TIMEZONES.length)
  })
})
