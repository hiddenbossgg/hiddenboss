import { test } from '@japa/runner'
import { suggestLocations } from '#lib/geo/location_suggestions'

test.group('suggestLocations', () => {
  test('a query below the minimum length returns nothing', ({ assert }) => {
    assert.deepEqual(suggestLocations('city', 'S'), [])
    assert.deepEqual(suggestLocations('city', ''), [])
  })

  test('a city query matches by prefix, whatever the case, and includes its state and country', ({
    assert,
  }) => {
    const suggestions = suggestLocations('city', 'Spoka')

    assert.isAbove(suggestions.length, 0)
    assert.isTrue(suggestions.some((suggestion) => suggestion.label === 'Spokane, WA, US'))

    const spokane = suggestions.find((suggestion) => suggestion.city === 'Spokane')!
    assert.equal(spokane.state, 'WA')
    assert.equal(spokane.country, 'US')
  })

  test('a country query matches by name and returns its alpha-2 code', ({ assert }) => {
    const suggestions = suggestLocations('country', 'Uni')

    assert.isTrue(suggestions.some((suggestion) => suggestion.country === 'US'))
  })

  test('a state query matches by name and includes its country', ({ assert }) => {
    const suggestions = suggestLocations('state', 'Washi')

    const washington = suggestions.find((suggestion) => suggestion.state === 'WA')!
    assert.exists(washington)
    assert.equal(washington.country, 'US')
  })

  test('scoping a city search to a country excludes matches from elsewhere', ({ assert }) => {
    // "London" exists in both the UK and Ontario, Canada.
    const unscoped = suggestLocations('city', 'London')
    assert.isTrue(unscoped.some((suggestion) => suggestion.country === 'GB'))
    assert.isTrue(unscoped.some((suggestion) => suggestion.country === 'CA'))

    const scopedToCanada = suggestLocations('city', 'London', { country: 'CA' })
    assert.isTrue(scopedToCanada.every((suggestion) => suggestion.country === 'CA'))
    assert.isAbove(scopedToCanada.length, 0)
  })

  test('scoping a state search to a country excludes states of other countries', ({ assert }) => {
    const suggestions = suggestLocations('state', 'Wa', { country: 'US' })

    assert.isAbove(suggestions.length, 0)
    assert.isTrue(suggestions.every((suggestion) => suggestion.country === 'US'))
  })
})
