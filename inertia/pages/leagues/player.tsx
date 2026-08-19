import type React from 'react'
import { Link } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'
import RankingHistoryChart from '../../components/ranking_history_chart.js'
import type { HistoryPoint } from '../../components/ranking_history_chart.js'
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
    label: string
    round: string | null
    opponent: string | null
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
  }>
}

/** Groups consecutive matches under the event they were played in. */
function byEvent(matches: Props['matches']) {
  const groups: Array<{ label: string; matches: Props['matches'] }> = []

  for (const match of matches) {
    const last = groups[groups.length - 1]
    if (last?.label === match.label) last.matches.push(match)
    else groups.push({ label: match.label, matches: [match] })
  }

  return groups
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
      {matches.length === 0 ? (
        <p>No rated sets yet.</p>
      ) : (
        byEvent(matches).map((group) => (
          <div key={group.label}>
            <h3>{group.label}</h3>
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
                      <td>{match.opponent ?? '—'}</td>
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
        ))
      )}

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
            {account.gamerTag} · {account.platformKey}
            {account.provisional && ' · needs review'}
          </li>
        ))}
      </ul>
    </>
  )
}

export default PlayerProfile
