import type React from 'react'
import { Link } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'

type Props = {
  league: { slug: string; name: string }
  canManage: boolean
  slug: string
}

const PlayerNotFound: React.FC<Props> = ({ league, canManage, slug }) => {
  return (
    <>
      <LeagueNav slug={league.slug} name={league.name} canManage={canManage} />

      <h1>Player not found</h1>
      <p>
        There is no player <strong>{slug}</strong> in {league.name}.
      </p>
      <p className="not-found-back">
        <Link route="players.index" routeParams={{ league: league.slug }}>
          Back to players
        </Link>
      </p>
    </>
  )
}

export default PlayerNotFound
