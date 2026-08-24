import { test } from '@japa/runner'
import { normalizeCountry, resolveCountryCode } from '#lib/geo/normalize_country'

test.group('normalizeCountry', () => {
  test('a recognised display name resolves to its ISO code', ({ assert }) => {
    assert.equal(normalizeCountry('United States'), 'US')
  })

  test('is case-insensitive and tolerates surrounding whitespace', ({ assert }) => {
    assert.equal(normalizeCountry('  united states  '), 'US')
  })

  test('an already-correct ISO code passes through unchanged', ({ assert }) => {
    assert.equal(normalizeCountry('US'), 'US')
  })

  /** Still worth keeping for display — just not something scoping can use. */
  test('an unrecognised value is kept as-is rather than dropped', ({ assert }) => {
    assert.equal(normalizeCountry('Nowhereland'), 'Nowhereland')
  })

  test('null and empty pass through unchanged', ({ assert }) => {
    assert.isNull(normalizeCountry(null))
    assert.equal(normalizeCountry(''), '')
  })
})

test.group('resolveCountryCode', () => {
  test('resolves by code or name, returning null when neither matches', ({ assert }) => {
    assert.equal(resolveCountryCode('US'), 'US')
    assert.equal(resolveCountryCode('United States'), 'US')
    assert.isNull(resolveCountryCode('Nowhereland'))
    assert.isNull(resolveCountryCode(null))
  })
})
