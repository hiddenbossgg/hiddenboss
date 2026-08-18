import { useEffect, useRef, useState } from 'react'
import { urlFor } from '../client.js'

export type LocationField = 'country' | 'state' | 'city'

export type LocationSuggestion = {
  label: string
  country?: string
  state?: string
  city?: string
}

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 200

/**
 * Debounced autocomplete over `#lib/geo/location_suggestions` — "type Spoka,
 * see Spokane, WA". `scope` narrows a state or city search to a country (and
 * a city search further to a state) already typed on the same row, so a
 * suggestion is never inconsistent with the clause's other fields.
 *
 * Stale responses are dropped by request id rather than by cancelling the
 * fetch, since a debounce already limits how many are in flight and a
 * dropped-but-still-pending request costs nothing once its result is ignored.
 */
export function useLocationSuggestions(
  league: string,
  field: LocationField,
  query: string,
  scope: { country?: string; state?: string } = {}
): LocationSuggestion[] {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const requestId = useRef(0)
  const { country, state } = scope
  const tooShort = query.trim().length < MIN_QUERY_LENGTH

  useEffect(() => {
    if (tooShort) return

    const id = ++requestId.current

    const timer = setTimeout(async () => {
      const url = urlFor('rankings.locations', { league }, { qs: { field, query, country, state } })

      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        })
        if (!response.ok || id !== requestId.current) return

        const data = await response.json()
        if (id === requestId.current) setSuggestions(data.suggestions ?? [])
      } catch {
        // A flaky suggestion request just means no suggestions this
        // keystroke — the field itself still accepts free text.
        if (id === requestId.current) setSuggestions([])
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [league, field, query, country, state, tooShort])

  // Derived rather than reset from inside the effect above, so clearing the
  // input back below the minimum length hides suggestions immediately
  // instead of flashing the previous query's results for one render.
  return tooShort ? [] : suggestions
}
