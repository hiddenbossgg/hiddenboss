import type React from 'react'
import { Link } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'

type Props = {
  league: { slug: string; name: string }
  canManage: boolean
  events: Array<{
    id: string
    name: string
    tournamentName: string
    entryKind: string
    gameName: string | null
    entrantCount: number | null
    completedSets: number
    platformKey: string
    url: string | null
    startAt: string | null
  }>
}

const Events: React.FC<Props> = ({ league, canManage, events }) => {
  return (
    <>
      <LeagueNav slug={league.slug} name={league.name} canManage={canManage} />

      <h1>Events</h1>

      {events.length === 0 ? (
        <p>No events imported yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Game</th>
                <th>Entrants</th>
                <th>Sets</th>
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
                  <td>{event.entrantCount ?? '—'}</td>
                  <td>{event.completedSets}</td>
                  <td>{event.startAt ?? '—'}</td>
                  <td>{event.platformKey}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default Events
