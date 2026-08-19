import { test } from '@japa/runner'
import { normalizeCountry, normalizeState, toAlpha2CountryCode } from '#lib/geo/country'

test.group('toAlpha2CountryCode', () => {
  test('an alpha-2 code is returned uppercased', ({ assert }) => {
    assert.equal(toAlpha2CountryCode('us'), 'US')
    assert.equal(toAlpha2CountryCode('US'), 'US')
  })

  test('an alpha-3 code resolves to its alpha-2 equivalent', ({ assert }) => {
    assert.equal(toAlpha2CountryCode('USA'), 'US')
  })

  test('a numeric code resolves to its alpha-2 equivalent', ({ assert }) => {
    assert.equal(toAlpha2CountryCode('840'), 'US')
  })

  test('a full English name resolves, case-insensitively', ({ assert }) => {
    assert.equal(toAlpha2CountryCode('United States'), 'US')
    assert.equal(toAlpha2CountryCode('united states of america'), 'US')
  })

  test('surrounding whitespace is ignored', ({ assert }) => {
    assert.equal(toAlpha2CountryCode('  US  '), 'US')
  })

  test('a name with an accent resolves without needing one typed', ({ assert }) => {
    assert.equal(toAlpha2CountryCode("Cote d'Ivoire"), 'CI')
  })

  test('nothing recognisable returns null', ({ assert }) => {
    assert.isNull(toAlpha2CountryCode('Wakanda'))
    assert.isNull(toAlpha2CountryCode(''))
  })
})

test.group('normalizeCountry', () => {
  test('a resolvable value normalises the same as toAlpha2CountryCode', ({ assert }) => {
    assert.equal(normalizeCountry('United States'), 'US')
    assert.equal(normalizeCountry('usa'), 'US')
  })

  test('null and empty input pass through as null, not an error', ({ assert }) => {
    assert.isNull(normalizeCountry(null))
    assert.isNull(normalizeCountry(''))
  })

  test('an unresolvable value falls back to null rather than throwing', ({ assert }) => {
    assert.isNull(normalizeCountry('Wakanda'))
    assert.isNull(normalizeCountry('Not A Real Country'))
  })
})

test.group('normalizeState', () => {
  test('a spelled-out name is converted to its ISO code', ({ assert }) => {
    assert.equal(normalizeState('Washington', 'US'), 'WA')
  })

  test('an already-abbreviated code is normalised to its canonical casing', ({ assert }) => {
    assert.equal(normalizeState('wa', 'US'), 'WA')
    assert.equal(normalizeState('WA', 'US'), 'WA')
  })

  test('matching is scoped to the given country, not any country with a same-named state', ({
    assert,
  }) => {
    // Western Australia is also "WA", but under country AU.
    assert.equal(normalizeState('Western Australia', 'AU'), 'WA')
    assert.equal(normalizeState('wa', 'AU'), 'WA')
  })

  test('an unrecognised state is kept exactly as given, only trimmed', ({ assert }) => {
    assert.equal(normalizeState('  Some Made Up Region  ', 'US'), 'Some Made Up Region')
    assert.equal(normalizeState('Nonexistentstate', null), 'Nonexistentstate')
  })

  test('a missing country still resolves an unambiguous name globally', ({ assert }) => {
    assert.equal(normalizeState('Washington', null), 'WA')
  })

  test('null and empty input pass through unchanged', ({ assert }) => {
    assert.isNull(normalizeState(null, 'US'))
    assert.equal(normalizeState('', 'US'), '')
  })

  test('an unrecognised country falls back to a global search', ({ assert }) => {
    assert.equal(normalizeState('Washington', 'ZZ'), 'WA')
  })
})
