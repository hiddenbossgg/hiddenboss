import type React from 'react'
import { useEffect, useState } from 'react'
import { Link } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'
import LocationAutocompleteInput from '../../components/location_autocomplete_input.js'
import { useLocationSuggestions } from '../../hooks/use_location_suggestions.js'
import { formatLocation } from '../../lib/format_location.js'

/** Reads the page's own query string once, for the initial filter state. */
function initialQueryParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

type SortMode = 'date-desc' | 'date-asc' | 'entrants-desc' | 'entrants-asc'

const SORT_LABELS: Record<SortMode, string> = {
  'date-desc': 'Newest first',
  'date-asc': 'Oldest first',
  'entrants-desc': 'Entrants (high to low)',
  'entrants-asc': 'Entrants (low to high)',
}
const SORT_MODES = Object.keys(SORT_LABELS) as SortMode[]
const DEFAULT_SORT_MODE: SortMode = 'date-desc'

type Props = {
  league: { slug: string; name: string }
  canManage: boolean
  events: Array<{
    id: string
    name: string
    tournamentName: string
    entryKind: string
    gameName: string | null
    entrantCount: number | null
    completedSets: number
    platformKey: string
    url: string | null
    startAt: string | null
    city: string | null
    state: string | null
    country: string | null
    address: string | null
  }>
}

type EventRow = Props['events'][number]

const Events: React.FC<Props> = ({ league, canManage, events }) => {
  const [countryFilter, setCountryFilter] = useState(
    () => initialQueryParams().get('country') ?? ''
  )
  const [stateFilter, setStateFilter] = useState(() => initialQueryParams().get('state') ?? '')
  const [cityFilter, setCityFilter] = useState(() => initialQueryParams().get('city') ?? '')
  const [minEntrants, setMinEntrants] = useState(
    () => initialQueryParams().get('minEntrants') ?? ''
  )
  const [maxEntrants, setMaxEntrants] = useState(
    () => initialQueryParams().get('maxEntrants') ?? ''
  )
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const fromUrl = initialQueryParams().get('sort')
    return (SORT_MODES as string[]).includes(fromUrl ?? '')
      ? (fromUrl as SortMode)
      : DEFAULT_SORT_MODE
  })

  const countrySuggestions = useLocationSuggestions(league.slug, 'country', countryFilter)
  const stateSuggestions = useLocationSuggestions(league.slug, 'state', stateFilter, {
    country: countryFilter || undefined,
  })
  const citySuggestions = useLocationSuggestions(league.slug, 'city', cityFilter, {
    country: countryFilter || undefined,
    state: stateFilter || undefined,
  })

  const locationFieldMatches = (actual: string | null, expected: string): boolean => {
    if (expected.trim() === '') return true
    if (actual === null) return false
    return actual.trim().toLowerCase() === expected.trim().toLowerCase()
  }

  const parseBound = (raw: string): number | null => {
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }
  const minBound = parseBound(minEntrants)
  const maxBound = parseBound(maxEntrants)

  const isRegionFiltering =
    countryFilter.trim() !== '' || stateFilter.trim() !== '' || cityFilter.trim() !== ''
  const isEntrantFiltering = minBound !== null || maxBound !== null
  const isFiltering = isRegionFiltering || isEntrantFiltering

  // An event with no recorded entrant count can't be placed in a range
  const entrantCountMatches = (count: number | null): boolean => {
    if (!isEntrantFiltering) return true
    if (count === null) return false
    if (minBound !== null && count < minBound) return false
    return !(maxBound !== null && count > maxBound)
  }

  const filtered = events
    .filter(
      (event) =>
        locationFieldMatches(event.country, countryFilter) &&
        locationFieldMatches(event.state, stateFilter) &&
        locationFieldMatches(event.city, cityFilter)
    )
    .filter((event) => entrantCountMatches(event.entrantCount))

  // A missing date or entrant count sorts to the end
  const byDate = (a: EventRow, b: EventRow, sign: 1 | -1) => {
    if (a.startAt !== null && b.startAt !== null) {
      if (a.startAt === b.startAt) return 0
      return (a.startAt < b.startAt ? -1 : 1) * sign
    }
    if (a.startAt !== null) return -1
    if (b.startAt !== null) return 1
    return 0
  }
  const byEntrants = (a: EventRow, b: EventRow, sign: 1 | -1) => {
    if (a.entrantCount !== null && b.entrantCount !== null) {
      return (a.entrantCount - b.entrantCount) * sign
    }
    if (a.entrantCount !== null) return -1
    if (b.entrantCount !== null) return 1
    return 0
  }
  const sortEvents = (list: EventRow[]): EventRow[] => {
    const copy = [...list]
    switch (sortMode) {
      case 'date-desc':
        return copy.sort((a, b) => byDate(a, b, -1))
      case 'date-asc':
        return copy.sort((a, b) => byDate(a, b, 1))
      case 'entrants-desc':
        return copy.sort((a, b) => byEntrants(a, b, -1))
      case 'entrants-asc':
        return copy.sort((a, b) => byEntrants(a, b, 1))
    }
  }
  const visible = sortEvents(filtered)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sync = (key: string, value: string) =>
      value.trim() !== '' ? params.set(key, value) : params.delete(key)
    sync('country', countryFilter)
    sync('state', stateFilter)
    sync('city', cityFilter)
    sync('minEntrants', minEntrants)
    sync('maxEntrants', maxEntrants)

    if (sortMode !== DEFAULT_SORT_MODE) params.set('sort', sortMode)
    else params.delete('sort')

    const query = params.toString()
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`
    window.history.replaceState(window.history.state, '', url)
  }, [countryFilter, stateFilter, cityFilter, minEntrants, maxEntrants, sortMode])

  return (
    <>
      <LeagueNav slug={league.slug} name={league.name} canManage={canManage} />

      <h1>Events</h1>

      {events.length > 0 && (
        <p>
          {isFiltering ? (
            <>
              {filtered.length} of {events.length} events
            </>
          ) : (
            <>
              {events.length} event{events.length === 1 ? '' : 's'}
            </>
          )}
        </p>
      )}

      {events.length > 0 && (
        <p className="events-sort">
          <label>
            Sort{' '}
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
            >
              {SORT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {SORT_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
        </p>
      )}

      {events.length > 0 && (
        <details className="list-filters edit-panel">
          <summary>Filter events</summary>

          <p>
            <label>
              Location{' '}
              <LocationAutocompleteInput
                name="country"
                ariaLabel="Country"
                placeholder="any country"
                value={countryFilter}
                suggestions={countrySuggestions}
                onChange={setCountryFilter}
                onSelect={(suggestion) => setCountryFilter(suggestion.country ?? suggestion.label)}
              />{' '}
              <LocationAutocompleteInput
                name="state"
                ariaLabel="State or province"
                placeholder="any state/province"
                value={stateFilter}
                suggestions={stateSuggestions}
                onChange={setStateFilter}
                onSelect={(suggestion) => setStateFilter(suggestion.state ?? suggestion.label)}
              />{' '}
              <LocationAutocompleteInput
                name="city"
                ariaLabel="City"
                placeholder="any city"
                value={cityFilter}
                suggestions={citySuggestions}
                onChange={setCityFilter}
                onSelect={(suggestion) => setCityFilter(suggestion.city ?? suggestion.label)}
              />
            </label>
          </p>

          <p>
            <label>
              Entrants{' '}
              <input
                className="h2h-page-size-input"
                type="number"
                min={0}
                placeholder="min"
                aria-label="Minimum entrants"
                value={minEntrants}
                onChange={(event) => setMinEntrants(event.target.value)}
              />{' '}
              –{' '}
              <input
                className="h2h-page-size-input"
                type="number"
                min={0}
                placeholder="max"
                aria-label="Maximum entrants"
                value={maxEntrants}
                onChange={(event) => setMaxEntrants(event.target.value)}
              />
            </label>
          </p>
        </details>
      )}

      {events.length === 0 ? (
        <p>No events imported yet.</p>
      ) : filtered.length === 0 ? (
        <p>No events match your filters.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Game</th>
                <th>Location</th>
                <th>Entrants</th>
                <th>Sets</th>
                <th>Date</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((event) => (
                <tr key={event.id}>
                  <td>
                    <Link
                      route="events.show"
                      routeParams={{ league: league.slug, event: event.id }}
                    >
                      {event.tournamentName} - {event.name}
                    </Link>{' '}
                    <span>({event.entryKind})</span>
                  </td>
                  <td>{event.gameName ?? '—'}</td>
                  {/* The full street address is shown on the event page; here just city/state/country. */}
                  <td>
                    {formatLocation({
                      city: event.city,
                      state: event.state,
                      country: event.country,
                    }) ?? '—'}
                  </td>
                  <td>{event.entrantCount ?? '—'}</td>
                  <td>{event.completedSets}</td>
                  <td>{event.startAt ?? '—'}</td>
                  <td>
                    {event.url ? (
                      <a href={event.url} rel="noreferrer noopener" target="_blank">
                        {event.platformKey}
                      </a>
                    ) : (
                      event.platformKey
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default Events
