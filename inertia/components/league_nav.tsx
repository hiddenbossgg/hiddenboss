import type React from 'react'
import { Link } from '@adonisjs/inertia/react'

type Props = {
  slug: string
  name: string
  /** Admin links are hidden from visitors who cannot use them. */
  canManage?: boolean
}

/**
 * Navigation shared by every league page.
 *
 * Without it each league page is a dead end — you can reach imports from the
 * league home but not the other way around.
 */
const LeagueNav: React.FC<Props> = ({ slug, name, canManage = true }) => {
  return (
    <nav aria-label={`${name} pages`} className="league-nav">
      <Link route="leagues.show" routeParams={{ league: slug }}>
        {name}
      </Link>

      <Link route="rankings.index" routeParams={{ league: slug }}>
        Rankings
      </Link>

      <Link route="players.index" routeParams={{ league: slug }}>
        Players
      </Link>

      <Link route="events.index" routeParams={{ league: slug }}>
        Events
      </Link>

      {canManage && (
        <>
          <Link route="imports.index" routeParams={{ league: slug }}>
            Imports
          </Link>
          <Link route="credentials.index" routeParams={{ league: slug }}>
            Credentials
          </Link>
          <Link route="leagues.edit" routeParams={{ league: slug }}>
            Settings
          </Link>
        </>
      )}
    </nav>
  )
}

export default LeagueNav
