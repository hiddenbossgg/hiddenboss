import type React from 'react'
import { useState } from 'react'

type Props<T extends { label: string }> = {
  /**
   * Omit to keep the typed text out of form submission — the caller carries the
   * resolved value in a hidden field instead.
   */
  name?: string
  ariaLabel: string
  placeholder?: string
  value: string
  suggestions: T[]
  onChange: (value: string) => void
  onSelect: (suggestion: T) => void
  /** List key, for when two suggestions can share a label. Defaults to the label. */
  keyOf?: (suggestion: T) => string
}

/**
 * A text input with a suggestion dropdown underneath — the suggestions are an
 * autofill aid, not a constraint, so the input still holds whatever the admin
 * typed even if they never pick one.
 */
export default function AutocompleteInput<T extends { label: string }>({
  name,
  ariaLabel,
  placeholder,
  value,
  suggestions,
  onChange,
  onSelect,
  keyOf = (suggestion) => suggestion.label,
}: Props<T>): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const listboxId = `${(name ?? ariaLabel).replace(/\s+/g, '-')}-listbox`

  function choose(suggestion: T) {
    onSelect(suggestion)
    setOpen(false)
  }

  return (
    <span className="autocomplete">
      <input
        type="text"
        name={name}
        aria-label={ariaLabel}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listboxId}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
          setHighlighted(0)
        }}
        onFocus={() => setOpen(true)}
        // Delayed so a click on a suggestion registers before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (!open || suggestions.length === 0) return

          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlighted((current) => (current + 1) % suggestions.length)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlighted((current) => (current - 1 + suggestions.length) % suggestions.length)
          } else if (event.key === 'Enter' && suggestions[highlighted]) {
            event.preventDefault()
            choose(suggestions[highlighted])
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && suggestions.length > 0 && (
        <ul id={listboxId} role="listbox" className="autocomplete-menu">
          {suggestions.map((suggestion, index) => (
            <li key={keyOf(suggestion)} role="option" aria-selected={index === highlighted}>
              <button
                type="button"
                // Fires before the input's blur handler would close the list.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(suggestion)}
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
