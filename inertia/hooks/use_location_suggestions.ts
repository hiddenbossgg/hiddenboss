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
        if (id === requestId.current) setSuggestions([])
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [league, field, query, country, state, tooShort])

  // Derived, not reset inside the effect, so it hides immediately rather
  // than flashing stale results for one render.
  return tooShort ? [] : suggestions
}
