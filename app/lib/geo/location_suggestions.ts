/**
 * Autocomplete for a ranking's location activity requirements, backed by the
 * `country-state-city` dataset.
 */
import { City, Country, State } from 'country-state-city'
import type { ICity } from 'country-state-city'
import { resolveCountryCode } from '#lib/geo/normalize_country'

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

/**
 * State scope values arrive the same way country ones do — either an ISO
 * code or free text — so they are resolved the same way before filtering.
 */
function resolveStateCode(state: string | null, countryCode: string | null): string | null {
  if (!state) return null
  const trimmed = state.trim().toLowerCase()
  if (!trimmed) return null

  const pool = countryCode ? State.getStatesOfCountry(countryCode) : ALL_STATES
  const match = pool.find(
    (candidate) =>
      candidate.isoCode.toLowerCase() === trimmed || candidate.name.toLowerCase() === trimmed
  )
  return match?.isoCode ?? null
}

function suggestStates(query: string, countryCode: string | null): LocationSuggestion[] {
  const pool = countryCode ? State.getStatesOfCountry(countryCode) : ALL_STATES

  return pool
    .filter((state) => startsWith(state.name, query))
    .slice(0, MAX_SUGGESTIONS)
    .map((state) => ({
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

/** Keep suggestion consistent with other fields. */
export function suggestLocations(
  field: LocationField,
  query: string,
  scope: { country?: string | null; state?: string | null } = {}
): LocationSuggestion[] {
  const trimmed = query.trim().toLowerCase()
  if (trimmed.length < MIN_QUERY_LENGTH) return []

  const countryCode = resolveCountryCode(scope.country ?? null)

  switch (field) {
    case 'country':
      return suggestCountries(trimmed)
    case 'state':
      return suggestStates(trimmed, countryCode)
    case 'city':
      return suggestCities(trimmed, countryCode, resolveStateCode(scope.state ?? null, countryCode))
  }
}
