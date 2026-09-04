import type React from 'react'
import AutocompleteInput from './autocomplete_input.js'
import type { LocationSuggestion } from '../hooks/use_location_suggestions.js'

type Props = {
  name: string
  ariaLabel: string
  placeholder?: string
  value: string
  suggestions: LocationSuggestion[]
  onChange: (value: string) => void
  onSelect: (suggestion: LocationSuggestion) => void
}

/** `AutocompleteInput` bound to the location suggestion shape. */
const LocationAutocompleteInput: React.FC<Props> = (props) => (
  <AutocompleteInput<LocationSuggestion> {...props} />
)

export default LocationAutocompleteInput
