import type React from 'react'
import { Link } from '@adonisjs/inertia/react'

/**
 * Page props are declared with `type`, never `interface`.
 *
 * Inertia's render() constrains props to a serializable object shape, and a
 * TypeScript interface has no implicit index signature, so an interface-typed
 * prop silently resolves the page to `never` at the call site.
 */
type LeagueSummary = {
  slug: string
  name: string
  visibility: string
}

type Props = {
  leagues: LeagueSummary[]
}

const LeaguesIndex: React.FC<Props> = ({ leagues }) => {
  return (
    <>
      <h1>Your leagues</h1>

      {leagues.length === 0 ? (
        <p>
          You do not administer any leagues yet. <Link route="leagues.create">Create one</Link>.
        </p>
      ) : (
        <ul>
          {leagues.map((league) => (
            <li key={league.slug}>
              <Link route="leagues.show" routeParams={{ league: league.slug }}>
                {league.name}
              </Link>
              {league.visibility === 'private' && <span> (private)</span>}
              {' · '}
              <Link route="leagues.edit" routeParams={{ league: league.slug }}>
                Settings
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p>
        <Link route="leagues.create">Create a league</Link>
      </p>
    </>
  )
}

export default LeaguesIndex
