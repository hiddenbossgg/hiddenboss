import { test } from '@japa/runner'
import { normalizeState } from '#lib/geo/normalize_state'

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
