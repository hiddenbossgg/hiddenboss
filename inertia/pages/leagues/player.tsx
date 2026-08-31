import type React from 'react'
import { useState } from 'react'
import { Form, Link } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'
import PlayerLinkList from '../../components/player_link_list.js'
import RankingHistoryChart from '../../components/ranking_history_chart.js'
import type { HistoryPoint } from '../../components/ranking_history_chart.js'
import LocationAutocompleteInput from '../../components/location_autocomplete_input.js'
import { useLocationSuggestions } from '../../hooks/use_location_suggestions.js'
import { formatLocation } from '../../lib/format_location.js'

type Props = {
  league: { slug: string; name: string }
  canManage: boolean
  player: {
    slug: string
    displayTag: string
    pronouns: string | null
    city: string | null
    state: string | null
    country: string | null
  }
  ranking: { slug: string; name: string } | null
  standing: {
    rank: number
    rating: number
    wins: number
    losses: number
    setsPlayed: number
  } | null
  history: HistoryPoint[]
  matches: Array<{
    setId: string
    eventId: string
    label: string
    round: string | null
    opponents: Array<{ slug: string; displayTag: string }>
    won: boolean
    score: string | null
    before: number
    after: number
    delta: number
    occurredAt: string | null
  }>
  entries: Array<{
    eventId: string
    label: string
    entryKind: string
    placement: number | null
    entrantCount: number | null
    isDisqualified: boolean
    startAt: string | null
  }>
  accounts: Array<{
    platformKey: string
    gamerTag: string
    prefix: string | null
    source: string
    provisional: boolean
    profileUrl: string | null
  }>
}

type PlayerEditFormProps = {
  league: string
  player: string
  displayTag: string
  city: string | null
  state: string | null
  country: string | null
}

/**
 * Own component, not inlined below: it needs `useLocationSuggestions` state
 * per field, which only makes sense attached to a stable component instance.
 */
const PlayerEditForm: React.FC<PlayerEditFormProps> = ({
  league,
  player,
  displayTag,
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
    <Form route="players.update" routeParams={{ league, player }}>
      {({ errors, processing }) => (
        <>
          <label>
            Tag <input type="text" name="displayTag" defaultValue={displayTag} />
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
          {errors.displayTag && <p role="alert">{errors.displayTag}</p>}
          {errors.city && <p role="alert">{errors.city}</p>}
          {errors.state && <p role="alert">{errors.state}</p>}
          {errors.country && <p role="alert">{errors.country}</p>}
        </>
      )}
    </Form>
  )
}

/** Groups consecutive matches under the event they were played in. */
function byEvent(matches: Props['matches']) {
  const groups: Array<{ eventId: string; label: string; matches: Props['matches'] }> = []

  for (const match of matches) {
    const last = groups[groups.length - 1]
    if (last?.label === match.label) last.matches.push(match)
    else groups.push({ eventId: match.eventId, label: match.label, matches: [match] })
  }

  return groups
}

const MatchLog: React.FC<{ leagueSlug: string; matches: Props['matches'] }> = ({
  leagueSlug,
  matches,
}) => {
  if (matches.length === 0) return <p>No rated sets yet.</p>

  return (
    <>
      {byEvent(matches).map((group) => (
        <div key={group.label}>
          <h3>
            <Link route="events.show" routeParams={{ league: leagueSlug, event: group.eventId }}>
              {group.label}
            </Link>
          </h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Result</th>
                  <th>Opponent</th>
                  <th>Score</th>
                  <th>Round</th>
                  <th>Rating</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {group.matches.map((match) => (
                  <tr key={match.setId}>
                    <td>{match.won ? 'Win' : 'Loss'}</td>
                    <td>
                      <PlayerLinkList
                        leagueSlug={leagueSlug}
                        players={match.opponents.map((opponent) => ({
                          slug: opponent.slug,
                          label: opponent.displayTag,
                        }))}
                      />
                    </td>
                    <td>{match.score ?? '—'}</td>
                    <td>{match.round ?? '—'}</td>
                    {/* The point of ranking_set_deltas: not just that it moved, but by how much. */}
                    <td>
                      {match.after} ({match.delta >= 0 ? '+' : ''}
                      {match.delta})
                    </td>
                    <td>{match.occurredAt ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  )
}

const PlayerProfile: React.FC<Props> = ({
  league,
  canManage,
  player,
  ranking,
  standing,
  history,
  matches,
  entries,
  accounts,
}) => {
  return (
    <>
      <LeagueNav slug={league.slug} name={league.name} canManage={canManage} />

      <h1>{player.displayTag}</h1>
      {(player.pronouns || formatLocation(player)) && (
        <p>
          {player.pronouns}
          {player.pronouns && formatLocation(player) && ' · '}
          {formatLocation(player)}
        </p>
      )}

      {canManage && (
        <details className="edit-panel">
          <summary>Edit player</summary>
          <PlayerEditForm
            league={league.slug}
            player={player.slug}
            displayTag={player.displayTag}
            city={player.city}
            state={player.state}
            country={player.country}
          />
        </details>
      )}

      <h2>Ranking</h2>
      {standing && ranking ? (
        <p>
          <strong>#{standing.rank}</strong> · {standing.rating} in {ranking.name} · {standing.wins}–
          {standing.losses} across {standing.setsPlayed} set
          {standing.setsPlayed === 1 ? '' : 's'}
        </p>
      ) : (
        <p>Not rated{ranking ? ` in ${ranking.name}` : ' yet'} — no counted sets.</p>
      )}

      {ranking && (
        <>
          <h2>Ranking history</h2>
          <RankingHistoryChart history={history} rankingName={ranking.name} />
        </>
      )}

      <h2>Matches ({matches.length})</h2>
      <MatchLog leagueSlug={league.slug} matches={matches} />

      <h2>Events ({entries.length})</h2>
      {entries.length === 0 ? (
        <p>No events entered.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Placement</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={`${entry.eventId}-${entry.label}`}>
                  <td>
                    <Link
                      route="events.show"
                      routeParams={{ league: league.slug, event: entry.eventId }}
                    >
                      {entry.label}
                    </Link>{' '}
                    <span>({entry.entryKind})</span>
                  </td>
                  <td>
                    {entry.isDisqualified && 'DQ '}
                    {entry.placement ?? '—'}
                    {entry.entrantCount ? ` / ${entry.entrantCount}` : ''}
                  </td>
                  <td>{entry.startAt ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Accounts ({accounts.length})</h2>
      <ul>
        {accounts.map((account) => (
          <li key={`${account.platformKey}-${account.gamerTag}`}>
            {account.prefix ? `${account.prefix} | ` : ''}
            {account.profileUrl ? (
              <a href={account.profileUrl} rel="noreferrer noopener" target="_blank">
                {account.gamerTag}
              </a>
            ) : (
              account.gamerTag
            )}{' '}
            · {account.platformKey}
            {account.provisional && ' · needs review'}
          </li>
        ))}
      </ul>
    </>
  )
}

export default PlayerProfile
