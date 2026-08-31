import type React from 'react'
import { Link } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'

type Props = {
  league: { slug: string; name: string }
  canManage: boolean
}

const EventNotFound: React.FC<Props> = ({ league, canManage }) => {
  return (
    <>
      <LeagueNav slug={league.slug} name={league.name} canManage={canManage} />

      <h1>Event not found</h1>
      <p>This event was not found in {league.name}.</p>
      <p className="not-found-back">
        <Link route="events.index" routeParams={{ league: league.slug }}>
          Back to events
        </Link>
      </p>
    </>
  )
}

export default EventNotFound
