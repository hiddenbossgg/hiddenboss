import { suggestLocations } from '#lib/geo/location_suggestions'
import type { LocationField } from '#lib/geo/location_suggestions'
import type { HttpContext } from '@adonisjs/core/http'

const LOCATION_FIELDS: LocationField[] = ['country', 'state', 'city']

/**
 * Autocomplete for activity requirement location fields. League-scoped only
 * because that's where it's used — the underlying dataset is public, not
 * league-specific.
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
