import type React from 'react'
import { useState } from 'react'
import LocationAutocompleteInput from './location_autocomplete_input.js'
import { useLocationSuggestions } from '../hooks/use_location_suggestions.js'

type Row = {
  id: string
  count: string
  minEntrants: string
  locationCity: string
  locationState: string
  locationCountry: string
}

type Props = {
  league: string
  initial: Array<{
    count: number
    minEntrants: number | null
    location?: { country?: string; state?: string; city?: string } | null
  }>
  errors: Record<string, string>
}

function newRow(
  count = '1',
  minEntrants = '',
  locationCity = '',
  locationState = '',
  locationCountry = ''
): Row {
  return {
    id: crypto.randomUUID(),
    count,
    minEntrants,
    locationCity,
    locationState,
    locationCountry,
  }
}

type RowProps = {
  league: string
  index: number
  row: Row
  errors: Record<string, string>
  onChange: (field: keyof Omit<Row, 'id'>, value: string) => void
  onRemove: () => void
}

/**
 * Its own component, not inlined in the list below, so each row's three
 * `useLocationSuggestions` calls are hooks of a stable component instance
 * rather than hooks called inside `.map`, which breaks React's rules of
 * hooks once a row is added or removed anywhere but the end of the list.
 */
const RequirementRow: React.FC<RowProps> = ({ league, index, row, errors, onChange, onRemove }) => {
  const countrySuggestions = useLocationSuggestions(league, 'country', row.locationCountry)
  const stateSuggestions = useLocationSuggestions(league, 'state', row.locationState, {
    country: row.locationCountry || undefined,
  })
  const citySuggestions = useLocationSuggestions(league, 'city', row.locationCity, {
    country: row.locationCountry || undefined,
    state: row.locationState || undefined,
  })

  return (
    <div>
      <span>At least </span>
      <input
        type="number"
        name={`activityRequirements[${index}][count]`}
        aria-label="Number of tournaments"
        min={1}
        step={1}
        value={row.count}
        onChange={(event) => onChange('count', event.target.value)}
      />
      <span> tournament(s) with </span>
      <input
        type="number"
        name={`activityRequirements[${index}][minEntrants]`}
        aria-label="Minimum entrants"
        min={1}
        step={1}
        placeholder="any"
        value={row.minEntrants}
        onChange={(event) => onChange('minEntrants', event.target.value)}
      />
      <span> or more entrants, in </span>
      <LocationAutocompleteInput
        name={`activityRequirements[${index}][location][city]`}
        ariaLabel="City"
        placeholder="any city"
        value={row.locationCity}
        suggestions={citySuggestions}
        onChange={(value) => onChange('locationCity', value)}
        onSelect={(suggestion) => {
          onChange('locationCity', suggestion.city ?? suggestion.label)
          if (suggestion.state) onChange('locationState', suggestion.state)
          if (suggestion.country) onChange('locationCountry', suggestion.country)
        }}
      />
      <span>, </span>
      <LocationAutocompleteInput
        name={`activityRequirements[${index}][location][state]`}
        ariaLabel="State or province"
        placeholder="any state/province"
        value={row.locationState}
        suggestions={stateSuggestions}
        onChange={(value) => onChange('locationState', value)}
        onSelect={(suggestion) => {
          onChange('locationState', suggestion.state ?? suggestion.label)
          if (suggestion.country) onChange('locationCountry', suggestion.country)
        }}
      />
      <span>, </span>
      <LocationAutocompleteInput
        name={`activityRequirements[${index}][location][country]`}
        ariaLabel="Country"
        placeholder="any country"
        value={row.locationCountry}
        suggestions={countrySuggestions}
        onChange={(value) => onChange('locationCountry', value)}
        onSelect={(suggestion) =>
          onChange('locationCountry', suggestion.country ?? suggestion.label)
        }
      />{' '}
      <button type="button" onClick={onRemove}>
        Remove
      </button>
      {errors[`activityRequirements.${index}.count`] && (
        <p role="alert">{errors[`activityRequirements.${index}.count`]}</p>
      )}
      {errors[`activityRequirements.${index}.minEntrants`] && (
        <p role="alert">{errors[`activityRequirements.${index}.minEntrants`]}</p>
      )}
      {errors[`activityRequirements.${index}.location.city`] && (
        <p role="alert">{errors[`activityRequirements.${index}.location.city`]}</p>
      )}
      {errors[`activityRequirements.${index}.location.state`] && (
        <p role="alert">{errors[`activityRequirements.${index}.location.state`]}</p>
      )}
      {errors[`activityRequirements.${index}.location.country`] && (
        <p role="alert">{errors[`activityRequirements.${index}.location.country`]}</p>
      )}
    </div>
  )
}

/**
 * A ranking's activity requirements are a list of clauses — "3 tournaments
 * with 8+ entrants", "2 tournaments in Spokane, WA, USA" — all of which a
 * player must satisfy to be ranked. `Form` reads the actual `<input>`
 * elements at submit time, so adding or removing a row here only needs to
 * change what's rendered; the bracket-indexed `name`s are what the server
 * reassembles into an array.
 *
 * The three location fields combine as one filter on a single clause, not
 * three separate rows — each row demands its own count of qualifying
 * tournaments.
 */
const ActivityRequirementsEditor: React.FC<Props> = ({ league, initial, errors }) => {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0
      ? initial.map((requirement) =>
          newRow(
            String(requirement.count),
            requirement.minEntrants?.toString() ?? '',
            requirement.location?.city ?? '',
            requirement.location?.state ?? '',
            requirement.location?.country ?? ''
          )
        )
      : []
  )

  /**
   * Functional update: selecting a suggestion fires several `onChange`
   * calls back to back, each needing to build on the previous one rather
   * than the `rows` this render closed over.
   */
  function updateRow(id: string, field: keyof Omit<Row, 'id'>, value: string) {
    setRows((prevRows) => prevRows.map((row) => (row.id === id ? { ...row, [field]: value } : row)))
  }

  return (
    <div>
      <label>Activity requirements</label>
      <small>
        A player must satisfy every rule below to be ranked.
        {rows.length === 0 && ' None set, so everyone qualifies.'}
      </small>

      {rows.map((row, index) => (
        <RequirementRow
          key={row.id}
          league={league}
          index={index}
          row={row}
          errors={errors}
          onChange={(field, value) => updateRow(row.id, field, value)}
          onRemove={() => setRows((prevRows) => prevRows.filter((r) => r.id !== row.id))}
        />
      ))}

      <button type="button" onClick={() => setRows((prevRows) => [...prevRows, newRow()])}>
        + Add requirement
      </button>
    </div>
  )
}

export default ActivityRequirementsEditor
