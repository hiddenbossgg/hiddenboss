/**
 * Autocomplete suggestions for a ranking's location activity requirements —
 * type "Spoka", see "Spokane, WA" — backed by the `country-state-city`
 * dataset. Loaded once at module scope: `City.getAllCities()` is ~150k rows
 * and takes tens of milliseconds to build, which would be wasteful to repeat
 * on every request.
 *
 * Suggestions are a UX aid over the free-text fields validated in
 * `#validators/ranking`, not a second, stricter source of truth. State and
 * city stay unnormalised there for the same reason this module offers
 * suggestions rather than a fixed dropdown: platforms report them in
 * whatever form they use, so no fixed vocabulary can be authoritative —
 * picking a suggestion fills the field with plain text like any other input.
 */
import { City, Country, State } from 'country-state-city'
import type { ICity } from 'country-state-city'

export type LocationField = 'country' | 'state' | 'city'

export interface LocationSuggestion {
  label: string
  country?: string
  state?: string
  city?: string
}

const MIN_QUERY_LENGTH = 2
const MAX_SUGGESTIONS = 8

const ALL_COUNTRIES = Country.getAllCountries()
const ALL_STATES = State.getAllStates()
const ALL_CITIES = City.getAllCities()

function startsWith(name: string, query: string): boolean {
  return name.toLowerCase().startsWith(query)
}

function suggestCountries(query: string): LocationSuggestion[] {
  return ALL_COUNTRIES.filter((country) => startsWith(country.name, query))
    .slice(0, MAX_SUGGESTIONS)
    .map((country) => ({
      label: `${country.name} (${country.isoCode})`,
      country: country.isoCode,
    }))
}

function suggestStates(query: string, countryCode: string | null): LocationSuggestion[] {
  const pool = countryCode ? State.getStatesOfCountry(countryCode) : ALL_STATES

  return pool
    .filter((state) => startsWith(state.name, query))
    .slice(0, MAX_SUGGESTIONS)
    .map((state) => ({
      // The country is already fixed once it has narrowed the pool, so it
      // would be redundant in every label.
      label: countryCode ? state.name : `${state.name}, ${state.countryCode}`,
      state: state.isoCode,
      country: state.countryCode,
    }))
}

function suggestCities(
  query: string,
  countryCode: string | null,
  stateCode: string | null
): LocationSuggestion[] {
  const pool: ICity[] =
    (countryCode && stateCode
      ? City.getCitiesOfState(countryCode, stateCode)
      : countryCode
        ? City.getCitiesOfCountry(countryCode)
        : ALL_CITIES) ?? []

  return pool
    .filter((city) => startsWith(city.name, query))
    .slice(0, MAX_SUGGESTIONS)
    .map((city) => {
      const state = State.getStateByCodeAndCountry(city.stateCode, city.countryCode)
      const label = [city.name, state?.isoCode, city.countryCode].filter(Boolean).join(', ')

      return { label, city: city.name, state: state?.isoCode, country: city.countryCode }
    })
}

/**
 * `scope.country` (and, for a city, `scope.state`) narrows the search to
 * what the admin has already filled in on the same row, so a state or city
 * suggestion is always consistent with the other fields of the clause it
 * would complete — never a city whose real state contradicts one already
 * typed.
 */
export function suggestLocations(
  field: LocationField,
  query: string,
  scope: { country?: string | null; state?: string | null } = {}
): LocationSuggestion[] {
  const trimmed = query.trim().toLowerCase()
  if (trimmed.length < MIN_QUERY_LENGTH) return []

  switch (field) {
    case 'country':
      return suggestCountries(trimmed)
    case 'state':
      return suggestStates(trimmed, scope.country ?? null)
    case 'city':
      return suggestCities(trimmed, scope.country ?? null, scope.state ?? null)
  }
}
