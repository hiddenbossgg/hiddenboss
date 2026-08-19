import type React from 'react'
import { Link } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'

type Props = {
  league: {
    slug: string
    name: string
    description: string | null
  }
  rankings: Array<{
    slug: string
    name: string
    algorithm: string
  }>
  events: Array<{
    id: string
    name: string
    tournamentName: string
    entryKind: string
    gameName: string | null
    platformKey: string
    startAt: string | null
  }>
  canManage: boolean
}

const LeagueHome: React.FC<Props> = ({ league, rankings, events, canManage }) => {
  return (
    <>
      <LeagueNav slug={league.slug} name={league.name} canManage={canManage} />

      <h1>{league.name}</h1>
      {league.description && <p>{league.description}</p>}

      <h2>Rankings</h2>
      {rankings.length === 0 ? (
        <p>No rankings yet.</p>
      ) : (
        <ul>
          {rankings.map((ranking) => (
            <li key={ranking.slug}>
              <Link
                route="rankings.show"
                routeParams={{ league: league.slug, ranking: ranking.slug }}
              >
                {ranking.name}
              </Link>{' '}
              <span>({ranking.algorithm})</span>
            </li>
          ))}
        </ul>
      )}

      {/* Outside the empty-state branch so it stays reachable after the first one. */}
      {canManage && (
        <p>
          <Link className="button" route="rankings.create" routeParams={{ league: league.slug }}>
            Create a ranking
          </Link>
        </p>
      )}

      <h2>Events</h2>
      {events.length === 0 ? (
        <p>No events imported yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Game</th>
                <th>Date</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>
                    <Link
                      route="events.show"
                      routeParams={{ league: league.slug, event: event.id }}
                    >
                      {event.tournamentName} - {event.name}
                    </Link>{' '}
                    <span>({event.entryKind})</span>
                  </td>
                  <td>{event.gameName ?? '—'}</td>
                  <td>{event.startAt ?? '—'}</td>
                  <td>{event.platformKey}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <p>
          <Link className="button" route="imports.index" routeParams={{ league: league.slug }}>
            Import an event
          </Link>
        </p>
      )}
    </>
  )
}

export default LeagueHome
