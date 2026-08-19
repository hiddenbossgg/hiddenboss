import type React from 'react'
import { useState } from 'react'

type Row = { id: string; count: string; minEntrants: string }

type Props = {
  initial: Array<{ count: number; minEntrants: number | null }>
  errors: Record<string, string>
}

function newRow(count = '1', minEntrants = ''): Row {
  return { id: crypto.randomUUID(), count, minEntrants }
}

/**
 * A ranking's activity requirements are a list of clauses — "3 tournaments
 * with 8+ entrants", "5 tournaments of any size" — all of which a player
 * must satisfy to be ranked. `Form` reads the actual `<input>` elements at
 * submit time, so adding or removing a row here only needs to change what's
 * rendered; the bracket-indexed `name`s are what the server reassembles into
 * an array.
 */
const ActivityRequirementsEditor: React.FC<Props> = ({ initial, errors }) => {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0
      ? initial.map((requirement) =>
          newRow(String(requirement.count), requirement.minEntrants?.toString() ?? '')
        )
      : []
  )

  function updateRow(id: string, field: 'count' | 'minEntrants', value: string) {
    setRows(rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)))
  }

  return (
    <div>
      <label>Activity requirements</label>
      <small>
        A player must satisfy every rule below to be ranked.
        {rows.length === 0 && ' None set, so everyone qualifies.'}
      </small>

      {rows.map((row, index) => (
        <div key={row.id}>
          <span>At least </span>
          <input
            type="number"
            name={`activityRequirements[${index}][count]`}
            aria-label="Number of tournaments"
            min={1}
            step={1}
            value={row.count}
            onChange={(event) => updateRow(row.id, 'count', event.target.value)}
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
            onChange={(event) => updateRow(row.id, 'minEntrants', event.target.value)}
          />
          <span> or more entrants</span>{' '}
          <button type="button" onClick={() => setRows(rows.filter((r) => r.id !== row.id))}>
            Remove
          </button>
          {errors[`activityRequirements.${index}.count`] && (
            <p role="alert">{errors[`activityRequirements.${index}.count`]}</p>
          )}
          {errors[`activityRequirements.${index}.minEntrants`] && (
            <p role="alert">{errors[`activityRequirements.${index}.minEntrants`]}</p>
          )}
        </div>
      ))}

      <button type="button" onClick={() => setRows([...rows, newRow()])}>
        + Add requirement
      </button>
    </div>
  )
}

export default ActivityRequirementsEditor
