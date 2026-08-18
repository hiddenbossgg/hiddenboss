import { suggestLocations } from '#lib/geo/location_suggestions'
import type { LocationField } from '#lib/geo/location_suggestions'
import type { HttpContext } from '@adonisjs/core/http'

const LOCATION_FIELDS: LocationField[] = ['country', 'state', 'city']

/**
 * Autocomplete for the activity requirement location fields. League-scoped
 * and manage-gated purely because that is where it is used — the underlying
 * `country-state-city` dataset is public reference data, not league data.
 */
export default class LocationSuggestionsController {
  async index({ request, response }: HttpContext) {
    const field = request.input('field')
    const query = request.input('query', '')

    if (!LOCATION_FIELDS.includes(field)) {
      return response.badRequest({ message: 'field must be one of country, state, city' })
    }

    return {
      suggestions: suggestLocations(field, query, {
        country: request.input('country'),
        state: request.input('state'),
      }),
    }
  }
}
