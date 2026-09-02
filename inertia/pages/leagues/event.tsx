import type React from 'react'
import { useState } from 'react'
import { Form, Link } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'
import AutocompleteInput from '../../components/autocomplete_input.js'
import LocationAutocompleteInput from '../../components/location_autocomplete_input.js'
import { useLocationSuggestions } from '../../hooks/use_location_suggestions.js'
import { formatLocation } from '../../lib/format_location.js'
import { confirmSubmit } from '../../lib/confirm_submit.js'

type Props = {
  league: { slug: string; name: string }
  canManage: boolean
  event: {
    id: string
    name: string
    tournamentName: string
    entryKind: string
    gameName: string | null
    entrantCount: number | null
    platformKey: string
    url: string | null
    startAt: string | null
    city: string | null
    state: string | null
    country: string | null
    address: string | null
  }
  players: Array<{ id: string; displayTag: string }>
  entrants: Array<{
    id: string
    name: string
    seed: number | null
    placement: number | null
    isDisqualified: boolean
    players: Array<{
      tag: string
      slug: string | null
      platformAccountId: string | null
      gamerTag: string | null
      platformKey: string | null
      provisional: boolean
    }>
  }>
  sets: Array<{
    id: string
    phase: string | null
    bracket: string | null
    round: string | null
    entrantA: string | null
    entrantB: string | null
    scoreA: number | null
    scoreB: number | null
    disqualifiedA: boolean
    disqualifiedB: boolean
    winnerIsA: boolean
    decided: boolean
    state: string
  }>
}

type EventEditFormProps = {
  league: string
  event: string
  eventName: string
  tournamentName: string
  startAt: string | null
  city: string | null
  state: string | null
  country: string | null
}

/**
 * Own component, not inlined below: it needs `useLocationSuggestions` state
 * per field, which only makes sense attached to a stable component instance.
 */
const EventEditForm: React.FC<EventEditFormProps> = ({
  league,
  event,
  eventName,
  tournamentName,
  startAt,
  city,
  state,
  country,
}) => {
  const [cityValue, setCityValue] = useState(city ?? '')
  const [stateValue, setStateValue] = useState(state ?? '')
  const [countryValue, setCountryValue] = useState(country ?? '')

  const citySuggestions = useLocationSuggestions(league, 'city', cityValue, {
    country: countryValue || undefined,
    state: stateValue || undefined,
  })
  const stateSuggestions = useLocationSuggestions(league, 'state', stateValue, {
    country: countryValue || undefined,
  })
  const countrySuggestions = useLocationSuggestions(league, 'country', countryValue)

  return (
    <Form route="events.update" routeParams={{ league, event }}>
      {({ errors, processing }) => (
        <>
          <label>
            Event name <input type="text" name="eventName" defaultValue={eventName} />
          </label>
          <label>
            Tournament name{' '}
            <input type="text" name="tournamentName" defaultValue={tournamentName} />
          </label>
          <label>
            Date <input type="date" name="startAt" defaultValue={startAt ?? ''} />
          </label>
          <label>
            Location
            <div className="location-fields">
              <LocationAutocompleteInput
                name="city"
                ariaLabel="City"
                placeholder="city"
                value={cityValue}
                suggestions={citySuggestions}
                onChange={setCityValue}
                onSelect={(suggestion) => {
                  setCityValue(suggestion.city ?? suggestion.label)
                  if (suggestion.state) setStateValue(suggestion.state)
                  if (suggestion.country) setCountryValue(suggestion.country)
                }}
              />
              <LocationAutocompleteInput
                name="state"
                ariaLabel="State or province"
                placeholder="state/province"
                value={stateValue}
                suggestions={stateSuggestions}
                onChange={setStateValue}
                onSelect={(suggestion) => {
                  setStateValue(suggestion.state ?? suggestion.label)
                  if (suggestion.country) setCountryValue(suggestion.country)
                }}
              />
              <LocationAutocompleteInput
                name="country"
                ariaLabel="Country"
                placeholder="country"
                value={countryValue}
                suggestions={countrySuggestions}
                onChange={setCountryValue}
                onSelect={(suggestion) => setCountryValue(suggestion.country ?? suggestion.label)}
              />
            </div>
          </label>
          <button type="submit" disabled={processing}>
            Save
          </button>
          {errors.eventName && <p role="alert">{errors.eventName}</p>}
          {errors.tournamentName && <p role="alert">{errors.tournamentName}</p>}
          {errors.startAt && <p role="alert">{errors.startAt}</p>}
          {errors.city && <p role="alert">{errors.city}</p>}
          {errors.state && <p role="alert">{errors.state}</p>}
          {errors.country && <p role="alert">{errors.country}</p>}
        </>
      )}
    </Form>
  )
}

type PlayerSuggestion = { label: string; id: string }

/**
 * Moves one imported account to another player, or splits it out into a player
 * created for it.
 */
const ReassignForm: React.FC<{
  leagueSlug: string
  platformAccountId: string
  gamerTag: string | null
  players: Props['players']
}> = ({ leagueSlug, platformAccountId, gamerTag, players }) => {
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')

  const needle = query.trim().toLowerCase()
  const matches: PlayerSuggestion[] = needle
    ? players
        .filter((player) => player.displayTag.toLowerCase().includes(needle))
        .slice(0, 8)
        .map((player) => ({ label: player.displayTag, id: player.id }))
    : []

  return (
    <Form route="identity.update" routeParams={{ league: leagueSlug }}>
      {({ processing }) => (
        <>
          <input type="hidden" name="platformAccountId" value={platformAccountId} />
          {creating ? (
            <>
              <input
                name="newPlayerTag"
                defaultValue={gamerTag ?? ''}
                placeholder="New player name"
                aria-label="New player name"
                required
              />{' '}
              <button type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>{' '}
              <button type="submit" disabled={processing}>
                Create
              </button>
            </>
          ) : (
            <>
              <AutocompleteInput<PlayerSuggestion>
                ariaLabel="Reassign to player"
                placeholder="Reassign to…"
                value={query}
                suggestions={matches}
                keyOf={(suggestion) => suggestion.id}
                onChange={(value) => {
                  setQuery(value)
                  // Editing after a pick invalidates it — force another choice.
                  setSelectedId('')
                }}
                onSelect={(suggestion) => {
                  setQuery(suggestion.label)
                  setSelectedId(suggestion.id)
                }}
              />{' '}
              {selectedId && <input type="hidden" name="leaguePlayerId" value={selectedId} />}
              <button type="button" onClick={() => setCreating(true)}>
                New player
              </button>{' '}
              <button type="submit" disabled={processing || selectedId === ''}>
                Reassign
              </button>
            </>
          )}
        </>
      )}
    </Form>
  )
}

/** A walkover has no score, so the DQ is shown in its place. */
function scoreOf(set: Props['sets'][number]) {
  if (set.disqualifiedA || set.disqualifiedB) return 'DQ'
  if (set.scoreA === null && set.scoreB === null) return '—'
  return `${set.scoreA ?? '—'}–${set.scoreB ?? '—'}`
}

const EventResults: React.FC<Props> = ({ league, canManage, event, players, entrants, sets }) => {
  return (
    <>
      <LeagueNav slug={league.slug} name={league.name} canManage={canManage} />

      <h1>
        {event.tournamentName} - {event.name}
      </h1>
      <p>
        {event.gameName && <>{event.gameName} · </>}
        {event.entryKind}
        {event.startAt && <> · {event.startAt}</>}
        {formatLocation(event) && <> · {formatLocation(event)}</>}
        {event.url && (
          <>
            {' · '}
            <a href={event.url} rel="noreferrer noopener" target="_blank">
              on {event.platformKey}
            </a>
          </>
        )}
      </p>

      {canManage && (
        <details>
          <summary>Edit event</summary>
          <EventEditForm
            league={league.slug}
            event={event.id}
            eventName={event.name}
            tournamentName={event.tournamentName}
            startAt={event.startAt}
            city={event.city}
            state={event.state}
            country={event.country}
          />
          <div className="danger-zone">
            <strong>Danger zone</strong>
            <Form route="events.destroy" routeParams={{ league: league.slug, event: event.id }}>
              {({ processing }) => (
                <div className="danger-action">
                  <p>
                    Drops it from every ranking&apos;s next recompute. Nothing is deleted — pasting
                    the same link re-imports it.
                  </p>
                  <button
                    type="submit"
                    disabled={processing}
                    onClick={confirmSubmit(
                      `Remove ${event.name} from ${league.name}? It drops from every ranking's next recompute. Nothing is deleted — pasting the same link re-imports it.`
                    )}
                  >
                    Remove from league
                  </button>
                </div>
              )}
            </Form>
          </div>
        </details>
      )}

      <h2>Placements ({entrants.length})</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Place</th>
              <th>Entrant</th>
              <th>Players</th>
              <th>Seed</th>
            </tr>
          </thead>
          <tbody>
            {entrants.map((entrant) => (
              <tr key={entrant.id}>
                <td>
                  {entrant.isDisqualified && 'DQ '}
                  {entrant.placement ?? '—'}
                </td>
                <td>{entrant.name}</td>
                <td>
                  {/* An entrant is 1..N players, so doubles teams link to both. */}
                  {entrant.players.length === 0
                    ? '—'
                    : entrant.players.map((player, index) => (
                        <span key={`${entrant.id}-${player.tag}`}>
                          {index > 0 && ' & '}
                          {player.slug ? (
                            <Link
                              route="players.show"
                              routeParams={{ league: league.slug, player: player.slug }}
                            >
                              {player.tag}
                            </Link>
                          ) : (
                            player.tag
                          )}
                        </span>
                      ))}
                </td>
                <td>{entrant.seed ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && (
        <>
          <h2>Identity</h2>
          <p>
            Each imported account is mapped to one league player. Two rows for one person is a merge
            away from correct, so fix it here — an account moves rather than being deleted, and the
            change is logged.
          </p>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Entrant</th>
                  <th>Imported account</th>
                  <th>Counts as</th>
                  <th>Reassign to</th>
                </tr>
              </thead>
              <tbody>
                {entrants.flatMap((entrant) =>
                  entrant.players
                    .filter((participant) => participant.platformAccountId !== null)
                    .map((participant) => (
                      <tr key={participant.platformAccountId!}>
                        <td>{entrant.name}</td>
                        <td>
                          {participant.gamerTag ?? '—'}
                          {participant.platformKey && <> · {participant.platformKey}</>}
                        </td>
                        <td>
                          {participant.slug ? (
                            <Link
                              route="players.show"
                              routeParams={{ league: league.slug, player: participant.slug }}
                            >
                              {participant.tag}
                            </Link>
                          ) : (
                            participant.tag
                          )}
                          {participant.provisional && ' · needs review'}
                        </td>
                        <td>
                          <ReassignForm
                            leagueSlug={league.slug}
                            platformAccountId={participant.platformAccountId!}
                            gamerTag={participant.gamerTag}
                            players={players}
                          />
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Sets ({sets.length})</h2>
      {sets.length === 0 ? (
        <p>No sets recorded. An event that has not been played yet looks like this.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Round</th>
                <th>Winner</th>
                <th>Loser</th>
                <th>Score</th>
                <th>Bracket</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((set) => (
                <tr key={set.id}>
                  <td>{set.round ?? '—'}</td>
                  <td>{set.decided ? (set.winnerIsA ? set.entrantA : set.entrantB) : '—'}</td>
                  <td>{set.decided ? (set.winnerIsA ? set.entrantB : set.entrantA) : '—'}</td>
                  <td>{scoreOf(set)}</td>
                  <td>
                    {set.phase ?? '—'}
                    {set.bracket && set.bracket !== set.phase && <> · {set.bracket}</>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default EventResults
