import vine from '@vinejs/vine'
import { toAlpha2CountryCode } from '#lib/geo/country'

const place = () => vine.string().trim().maxLength(100)
const displayName = () => vine.string().trim().minLength(1).maxLength(255)

/**
 * `tournaments.country` is expected to resolve to an ISO alpha-2 code.
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
 * A league admin's manual corrections to one event through the "Edit event" form.
 */
export const updateEventValidator = vine.create({
  eventName: displayName(),
  tournamentName: displayName(),
  city: place().optional(),
  state: place().optional(),
  country: place().use(countryCode()).optional(),
  startAt: vine.date().optional(),
})
