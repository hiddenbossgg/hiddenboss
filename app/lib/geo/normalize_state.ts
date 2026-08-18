/**
 * Standardises a tournament's state/province to its ISO 3166-2 code — "WA"
 * rather than "Washington" — since that is the form start.gg (and most
 * imports) already use, so this is the direction that keeps the widest set
 * of tournaments on the same convention rather than moving toward one.
 *
 * Applied once, at the import write path (`TournamentWriterService`), not in
 * each platform adapter: it is not platform-specific logic, so duplicating
 * it per adapter would just be the same rule copied several times.
 */
import { State } from 'country-state-city'

/**
 * `state` is matched against `country`'s own subdivisions first — scoping by
 * country avoids resolving to the wrong place when a code or name is reused
 * across countries (Western Australia's "WA" and Washington's "WA", for
 * one). If `country` is missing or unrecognised, every country's
 * subdivisions are searched instead, which is the best that can be done
 * without one.
 *
 * A `state` this module doesn't recognise — a typo, or a region
 * `country-state-city` simply doesn't have — is kept exactly as given rather
 * than dropped or guessed at: not standardising it is safer than
 * standardising it wrong.
 */
export function normalizeState(state: string | null, country: string | null): string | null {
  if (!state) return state

  const trimmed = state.trim()
  if (!trimmed) return state

  // An unrecognised country scopes to nothing, same as a missing one — both
  // fall back to a global search rather than resolving zero candidates.
  const scoped = country ? State.getStatesOfCountry(country) : []
  const pool = scoped.length > 0 ? scoped : State.getAllStates()

  const byCode = pool.find((candidate) => candidate.isoCode.toLowerCase() === trimmed.toLowerCase())
  if (byCode) return byCode.isoCode

  const byName = pool.find((candidate) => candidate.name.toLowerCase() === trimmed.toLowerCase())
  if (byName) return byName.isoCode

  return trimmed
}
