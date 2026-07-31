import type React from 'react'
import { Link } from '@adonisjs/inertia/react'
import { usePage } from '@inertiajs/react'

type LeagueCard = {
  slug: string
  name: string
  description?: string | null
  visibility?: string
}

type Props = {
  publicLeagues: LeagueCard[]
  myLeagues: LeagueCard[]
}

/**
 * Reuses the `.hero`, `.cards` and `.button` classes the scaffold already
 * styles, so the page looks deliberate without needing a stylesheet of its own.
 */
const Home: React.FC<Props> = ({ publicLeagues, myLeagues }) => {
  const { props } = usePage<{ user?: { initials: string } }>()
  const signedIn = Boolean(props.user)

  return (
    <>
      <div className="hero">
        <h1>Rankings for your scene</h1>
        <p>
          Import tournaments from start.gg and elsewhere, work out which entrants are the same
          person, and publish rankings your community can actually link to.
        </p>

        {signedIn ? (
          <Link className="button" route="leagues.create">
            Create a league
          </Link>
        ) : (
          <Link className="button" route="new_account.create">
            Get started
          </Link>
        )}
      </div>

      {signedIn && (
        <>
          <h2>Your leagues</h2>
          {myLeagues.length === 0 ? (
            <p>
              You do not administer a league yet. <Link route="leagues.create">Create one</Link> to
              start importing tournaments.
            </p>
          ) : (
            <div className="league-grid">
              {myLeagues.map((league) => (
                <Link key={league.slug} route="leagues.show" routeParams={{ league: league.slug }}>
                  <h3>{league.name} &nbsp;›</h3>
                  <p>{league.visibility === 'private' ? 'Private league' : 'Public league'}</p>
                </Link>
              ))}
            </div>
          )}

          <p>
            <Link route="leagues.index">Manage your leagues</Link>
          </p>
        </>
      )}

      <h2>Browse leagues</h2>
      {publicLeagues.length === 0 ? (
        <p>No public leagues yet.</p>
      ) : (
        <div className="league-grid">
          {publicLeagues.map((league) => (
            <Link key={league.slug} route="leagues.show" routeParams={{ league: league.slug }}>
              <h3>{league.name} &nbsp;›</h3>
              <p>{league.description || 'No description yet.'}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

export default Home
