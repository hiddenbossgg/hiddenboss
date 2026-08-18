/**
 * Resolves whatever a human — or a platform's API — sent as a country to its
 * ISO 3166-1 alpha-2 code. Alpha-2 is the only form `tournaments.country` is
 * ever stored in (every platform adapter writes alpha-2; see
 * `app/lib/platforms/canonical.ts`), and the column is `varchar(2)`, so
 * anything else either matches nothing or fails outright at write time.
 */
import countries from 'i18n-iso-countries'

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
