import { test } from '@japa/runner'
import { normalizeCountry, toAlpha2CountryCode } from '#lib/geo/normalize_country'

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
