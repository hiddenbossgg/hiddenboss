/**
 * Autocomplete for a ranking's location activity requirements, backed by the
 * `country-state-city` dataset.
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

  switch (field) {
    case 'country':
      return suggestCountries(trimmed)
    case 'state':
      return suggestStates(trimmed, scope.country ?? null)
    case 'city':
      return suggestCities(trimmed, scope.country ?? null, scope.state ?? null)
  }
}
