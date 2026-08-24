import { Country } from 'country-state-city'

const ALL_COUNTRIES = Country.getAllCountries()

/**
 * A country's ISO 3166-1 alpha-2 code, resolved from either the code itself
 * or its full display name (case-insensitive) — platforms report either.
 * Null when nothing in the dataset matches.
 */
export function resolveCountryCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return null

  const match = ALL_COUNTRIES.find(
    (candidate) =>
      candidate.isoCode.toLowerCase() === trimmed || candidate.name.toLowerCase() === trimmed
  )
  return match?.isoCode ?? null
}

/**
 * A platform's reported country, normalised to its ISO code where the
 * dataset recognises it. Falls back to the raw value verbatim otherwise —
 * still worth keeping for display, just not something location suggestions
 * or activity requirement filters can scope by.
 */
export function normalizeCountry(raw: string | null): string | null {
  if (!raw) return raw
  return resolveCountryCode(raw) ?? raw
}
