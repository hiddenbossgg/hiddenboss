import vine from '@vinejs/vine'
import { toAlpha2CountryCode } from '#lib/geo/country'

const place = () => vine.string().trim().maxLength(100)

/**
 * `tournaments.country` is `varchar(2)` — unlike a player's, which was
 * widened to fit a platform's free-text location name (see the migration
 * that widened it). A tournament's country is expected to resolve to an ISO
 * alpha-2 code, so an admin typing "United States" instead of picking the
 * suggestion needs resolving here rather than failing as a database error.
 */
const countryCode = vine.createRule((value, _options, field) => {
  if (typeof value !== 'string' || value.trim() === '') return

  const resolved = toAlpha2CountryCode(value)
  if (!resolved) {
    field.report('country must be a recognized country name or code', 'countryCode', field)
    return
  }

  field.mutate(resolved, field)
})

/**
 * A league admin's manual correction.
 */
export const updateTournamentValidator = vine.create({
  city: place().optional(),
  state: place().optional(),
  country: place().use(countryCode()).optional(),
  startAt: vine.date().optional(),
})
