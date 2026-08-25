import type React from 'react'
import { useState } from 'react'
import { Form, Link } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'
import LocationAutocompleteInput from '../../components/location_autocomplete_input.js'
import { useLocationSuggestions } from '../../hooks/use_location_suggestions.js'
import { formatLocation } from '../../lib/format_location.js'

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

type LocationFormProps = {
  league: string
  event: string
  city: string | null
  state: string | null
  country: string | null
}

/**
 * Own component, not inlined below: it needs `useLocationSuggestions` state
 * per field, which only makes sense attached to a stable component instance.
 */
const TournamentLocationForm: React.FC<LocationFormProps> = ({
  league,
  event,
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
    <Form route="events.updateLocation" routeParams={{ league, event }}>
      {({ errors, processing }) => (
        <>
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
          />{' '}
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
          />{' '}
          <LocationAutocompleteInput
            name="country"
            ariaLabel="Country"
            placeholder="country"
            value={countryValue}
            suggestions={countrySuggestions}
            onChange={setCountryValue}
            onSelect={(suggestion) => setCountryValue(suggestion.country ?? suggestion.label)}
          />{' '}
          <button type="submit" disabled={processing}>
            Save location
          </button>
          {errors.city && <p role="alert">{errors.city}</p>}
          {errors.state && <p role="alert">{errors.state}</p>}
          {errors.country && <p role="alert">{errors.country}</p>}
        </>
      )}
    </Form>
  )
}

const TournamentDateForm: React.FC<{ league: string; event: string; startAt: string | null }> = ({
  league,
  event,
  startAt,
}) => (
  <Form route="events.updateDate" routeParams={{ league, event }}>
    {({ errors, processing }) => (
      <>
        <input type="date" name="startAt" aria-label="Start date" defaultValue={startAt ?? ''} />{' '}
        <button type="submit" disabled={processing}>
          Save date
        </button>
        {errors.startAt && <p role="alert">{errors.startAt}</p>}
      </>
    )}
  </Form>
)

/** Sentinel for "not one of the existing players", which has no id to carry. */
const NEW_PLAYER = 'new'

/**
 * Moves one imported account to another player, or splits it out into a player
 * created for it.
 *
 * The new-player case is the only fix for automatic resolution having put two
 * people under one name: there is no existing row to pick, so without it the
 * mistake that loses information is the one that cannot be corrected. The tag
 * defaults to the account's own, which is what the import would have named it.
 */
const ReassignForm: React.FC<{
  leagueSlug: string
  platformAccountId: string
  gamerTag: string | null
  players: Props['players']
}> = ({ leagueSlug, platformAccountId, gamerTag, players }) => {
  const [target, setTarget] = useState('')
  const creating = target === NEW_PLAYER

  return (
    <Form route="identity.update" routeParams={{ league: leagueSlug }}>
      {({ processing }) => (
        <>
          <input type="hidden" name="platformAccountId" value={platformAccountId} />
          {/* Unnamed, so it stays a control: the field that submits depends on it. */}
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="" disabled>
              Choose a player…
            </option>
            {players.map((option) => (
              <option key={option.id} value={option.id}>
                {option.displayTag}
              </option>
            ))}
            <option value={NEW_PLAYER}>New player…</option>
          </select>{' '}
          {creating ? (
            <input
              name="newPlayerTag"
              defaultValue={gamerTag ?? ''}
              placeholder="Player name"
              aria-label="New player name"
              required
            />
          ) : (
            <input type="hidden" name="leaguePlayerId" value={target} />
          )}{' '}
          <button type="submit" disabled={processing || target === ''}>
            {creating ? 'Create' : 'Reassign'}
          </button>
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

      <h1>{event.name}</h1>
      <p>
        {event.tournamentName}
        {event.gameName && <> · {event.gameName}</>} · {event.entryKind}
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
          <summary>Edit location</summary>
          <TournamentLocationForm
            league={league.slug}
            event={event.id}
            city={event.city}
            state={event.state}
            country={event.country}
          />
        </details>
      )}

      {canManage && (
        <details>
          <summary>Edit date</summary>
          <TournamentDateForm league={league.slug} event={event.id} startAt={event.startAt} />
        </details>
      )}

      {canManage && (
        <Form route="events.destroy" routeParams={{ league: league.slug, event: event.id }}>
          {({ processing }) => (
            <>
              <button type="submit" disabled={processing}>
                Remove from league
              </button>
              <p>
                Drops it from every ranking&apos;s next recompute. Nothing is deleted — pasting the
                same link re-imports it.
              </p>
            </>
          )}
        </Form>
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
