import type React from 'react'
import { useState } from 'react'
import { Form, Link, useRouter } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'
import AutocompleteInput from '../../components/autocomplete_input.js'

type PlayerOption = { id: string; slug: string; displayTag: string }

type PlayerSummary = {
  id: string
  slug: string
  displayTag: string
  accountCount: number
  rank: number | null
  setsPlayed: number
}

type FieldStatus = 'agree' | 'only-a' | 'only-b' | 'conflict'

type FieldComparison = {
  key: string
  label: string
  a: string | null
  b: string | null
  aLabel: string | null
  bLabel: string | null
  status: FieldStatus
}

type Preview = {
  a: PlayerSummary
  b: PlayerSummary
  suggestedPrimary: 'a' | 'b'
  fields: FieldComparison[]
  sharedEvents: Array<{ eventId: string; label: string }>
}

type Props = {
  league: { slug: string; name: string }
  canManage: boolean
  players: PlayerOption[]
  selected: { a: string | null; b: string | null }
  preview: Preview | null
}

type Suggestion = { label: string; id: string }

function annotate(player: PlayerSummary): string {
  const parts = [
    player.rank !== null ? `#${player.rank}` : 'unrated',
    `${player.accountCount} account${player.accountCount === 1 ? '' : 's'}`,
  ]
  if (player.setsPlayed > 0) parts.push(`${player.setsPlayed} sets`)
  return parts.join(', ')
}

/**
 * The compare-and-confirm half, remounted (via `key`) whenever the pair changes
 * so the primary choice and any field overrides reset with it.
 */
const MergeCompare: React.FC<{ league: string; preview: Preview }> = ({ league, preview }) => {
  const [primary, setPrimary] = useState<'a' | 'b'>(preview.suggestedPrimary)
  const [overrides, setOverrides] = useState<Record<string, 'a' | 'b'>>({})

  const survivor = primary === 'a' ? preview.a : preview.b
  const merged = primary === 'a' ? preview.b : preview.a

  /** An only-a/only-b field starts on its populated side; a conflict on the primary. */
  const defaultSide = (field: FieldComparison): 'a' | 'b' =>
    field.status === 'only-a' ? 'a' : field.status === 'only-b' ? 'b' : primary
  const pickFor = (field: FieldComparison): 'a' | 'b' => overrides[field.key] ?? defaultSide(field)

  return (
    <Form route="players.merge.store" routeParams={{ league }}>
      {({ processing }) => (
        <>
          <fieldset className="merge-field">
            <legend>Keep as primary</legend>
            <p className="merge-hint">
              Its page and URL are what survive; the other becomes a redirect.
            </p>
            {(['a', 'b'] as const).map((side) => {
              const player = preview[side]
              return (
                <label key={side} className="checkbox-field">
                  <input
                    type="radio"
                    name="primary"
                    checked={primary === side}
                    onChange={() => setPrimary(side)}
                  />
                  {player.displayTag} <span>· {annotate(player)}</span>
                </label>
              )
            })}
          </fieldset>

          <input type="hidden" name="survivorId" value={survivor.id} />
          <input type="hidden" name="mergedId" value={merged.id} />

          {preview.fields.map((field) => {
            if (field.status === 'agree') {
              const shown = field.aLabel ?? field.a
              return (
                <p key={field.key} className="merge-agreed">
                  <strong>{field.label}:</strong> {shown ?? <em>not set</em>}
                  {shown !== null && ' · both agree'}
                </p>
              )
            }

            const pick = pickFor(field)
            return (
              <fieldset key={field.key} className="merge-field">
                <legend>{field.label}</legend>
                {(['a', 'b'] as const).map((side) => {
                  const value = side === 'a' ? field.a : field.b
                  const shown = side === 'a' ? (field.aLabel ?? field.a) : (field.bLabel ?? field.b)
                  return (
                    <label key={side} className="checkbox-field">
                      <input
                        type="radio"
                        name={field.key}
                        value={value ?? ''}
                        checked={pick === side}
                        onChange={() => setOverrides((prev) => ({ ...prev, [field.key]: side }))}
                      />
                      {shown ?? <em>no value</em>}
                      <span> · {preview[side].displayTag}</span>
                    </label>
                  )
                })}
              </fieldset>
            )
          })}

          {preview.sharedEvents.length > 0 && (
            <div className="merge-warning" role="alert">
              <strong>
                {preview.a.displayTag} and {preview.b.displayTag} have both entered{' '}
                {preview.sharedEvents.length} event
                {preview.sharedEvents.length === 1 ? '' : 's'}.
              </strong>
              <ul>
                {preview.sharedEvents.map((event) => (
                  <li key={event.eventId}>{event.label}</li>
                ))}
              </ul>
              <p>
                Merging combines their records in those events — wrong if they are actually
                different people, or a doubles pairing counted as one entrant.
              </p>
            </div>
          )}

          <button type="submit" disabled={processing}>
            Merge players
          </button>
        </>
      )}
    </Form>
  )
}

const PlayersMerge: React.FC<Props> = ({ league, canManage, players, selected, preview }) => {
  const router = useRouter()
  const tagOf = (id: string | null) => players.find((player) => player.id === id)?.displayTag ?? ''

  const [idA, setIdA] = useState(selected.a ?? '')
  const [idB, setIdB] = useState(selected.b ?? '')
  const [queryA, setQueryA] = useState(() => tagOf(selected.a))
  const [queryB, setQueryB] = useState(() => tagOf(selected.b))

  const compare = (a: string, b: string) => {
    if (!a || !b || a === b) return
    if (a === selected.a && b === selected.b) return
    router.visit(
      { route: 'players.merge', routeParams: { league: league.slug } },
      {
        data: { a, b },
        only: ['preview', 'selected'],
        preserveState: true,
        preserveScroll: true,
      }
    )
  }

  const suggestionsFor = (query: string, excludeId: string): Suggestion[] => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return []
    return players
      .filter((player) => player.id !== excludeId)
      .filter((player) => player.displayTag.toLowerCase().includes(needle))
      .slice(0, 8)
      .map((player) => ({ label: player.displayTag, id: player.id }))
  }

  return (
    <>
      <LeagueNav slug={league.slug} name={league.name} canManage={canManage} />

      <h1>Merge players</h1>
      <p>
        Combine two league players who are the same person. Every account and result from the second
        joins the first, and the second becomes a redirect to it. Rankings are marked stale so you
        can review before standings move.
      </p>

      <div className="merge-pickers">
        <label>
          First player
          <AutocompleteInput<Suggestion>
            ariaLabel="First player"
            placeholder="search players…"
            value={queryA}
            suggestions={suggestionsFor(queryA, idB)}
            keyOf={(suggestion) => suggestion.id}
            onChange={(value) => {
              setQueryA(value)
              setIdA('')
            }}
            onSelect={(suggestion) => {
              setQueryA(suggestion.label)
              setIdA(suggestion.id)
              compare(suggestion.id, idB)
            }}
          />
        </label>
        <label>
          Second player
          <AutocompleteInput<Suggestion>
            ariaLabel="Second player"
            placeholder="search players…"
            value={queryB}
            suggestions={suggestionsFor(queryB, idA)}
            keyOf={(suggestion) => suggestion.id}
            onChange={(value) => {
              setQueryB(value)
              setIdB('')
            }}
            onSelect={(suggestion) => {
              setQueryB(suggestion.label)
              setIdB(suggestion.id)
              compare(idA, suggestion.id)
            }}
          />
        </label>
      </div>

      {idA !== '' && idA === idB && <p role="alert">Pick two different players.</p>}
      {selected.a && selected.b && !preview && (
        <p role="alert">
          Couldn&apos;t load those two players — they may have already been merged.
        </p>
      )}

      {preview && (
        <MergeCompare
          key={`${preview.a.id}-${preview.b.id}`}
          league={league.slug}
          preview={preview}
        />
      )}

      <p>
        <Link route="players.index" routeParams={{ league: league.slug }}>
          Back to players
        </Link>
      </p>
    </>
  )
}

export default PlayersMerge
