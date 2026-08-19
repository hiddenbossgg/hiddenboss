/**
 * Country and state/province helpers used at the import write path.
 * `tournaments.country` is `varchar(2)` and every platform adapter writes
 * ISO 3166-1 alpha-2 (see `app/lib/platforms/canonical.ts`), so resolving a
 * country to that form is the shared piece; state normalisation is scoped by
 * the resolved country, which is why the two live together.
 */
import countries from 'i18n-iso-countries'
import { State } from 'country-state-city'

/**
 * Accepts alpha-2, alpha-3, numeric, or the country's English name. Returns
 * `null` on a miss rather than falling back to the raw input: unlike a state
 * or city, there is no safe "keep it as given" for a country — a value that
 * isn't a real ISO 3166-1 country can't be stored at all.
 *
 * Used where the caller can act on a `null` — `ManualAdapter` rejects the
 * import with the bad value in the message, since there is a human on the
 * other end who typed it and can fix it. For the write path all platforms
 * share, see `normalizeCountry` below instead.
 */
export function toAlpha2CountryCode(value: string): string | null {
  const trimmed = value.trim()

  if (countries.isValid(trimmed)) {
    return countries.toAlpha2(trimmed) ?? null
  }

  return countries.getSimpleAlpha2Code(trimmed, 'en') ?? null
}

/**
 * The safe form for `TournamentWriterService`, which every adapter's output
 * passes through and which has no human to hand a rejection back to. A
 * country that doesn't resolve is dropped to `null` instead of failing the
 * whole import over one non-essential field — the rest of a tournament is
 * still worth keeping. In practice this only ever fires for a platform bug:
 * `ManualAdapter` already rejects a bad value itself before it becomes
 * canonical data, and start.gg/parry.gg reliably send alpha-2 already.
 */
export function normalizeCountry(value: string | null): string | null {
  if (!value) return null

  return toAlpha2CountryCode(value)
}

/**
 * Standardises a tournament's state/province to its ISO 3166-2 code — "WA"
 * rather than "Washington" — since that is the form start.gg (and most
 * imports) already use, so this is the direction that keeps the widest set
 * of tournaments on the same convention rather than moving toward one.
 *
 * Applied once, at the import write path (`TournamentWriterService`), not in
 * each platform adapter: it is not platform-specific logic, so duplicating
 * it per adapter would just be the same rule copied several times.
 *
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
