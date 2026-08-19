import type React from 'react'
import { Link } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'
import { formatLocation } from '../../lib/format_location.js'

type Props = {
  league: { slug: string; name: string }
  canManage: boolean
  ranking: { slug: string; name: string } | null
  players: Array<{
    slug: string
    displayTag: string
    city: string | null
    state: string | null
    country: string | null
    rank: number | null
    rating: number | null
    wins: number
    losses: number
    setsPlayed: number
  }>
}

const Players: React.FC<Props> = ({ league, canManage, ranking, players }) => {
  return (
    <>
      <LeagueNav slug={league.slug} name={league.name} canManage={canManage} />

      <h1>Players</h1>

      <p>
        {players.length} player{players.length === 1 ? '' : 's'}
        {ranking && <> · rated against {ranking.name}</>}
      </p>

      {players.length === 0 ? (
        <p>No players yet. They arrive with the first imported event.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Location</th>
                <th>Rating</th>
                <th>W–L</th>
                <th>Sets</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.slug}>
                  {/* Unranked players still belong to the league — they just have no rated sets. */}
                  <td>{player.rank ?? '—'}</td>
                  <td>
                    <Link
                      route="players.show"
                      routeParams={{ league: league.slug, player: player.slug }}
                    >
                      {player.displayTag}
                    </Link>
                  </td>
                  <td>{formatLocation(player) ?? '—'}</td>
                  <td>{player.rating ?? '—'}</td>
                  <td>
                    {player.wins}–{player.losses}
                  </td>
                  <td>{player.setsPlayed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default Players
