import type React from 'react'
import { Link } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'

type Props = {
  league: { slug: string; name: string }
  canManage: boolean
  rankings: Array<{
    slug: string
    name: string
    algorithm: string
    published: boolean
    isStale: boolean
    staleCount: number
    hasRecompute: boolean
  }>
}

const Rankings: React.FC<Props> = ({ league, canManage, rankings }) => {
  return (
    <>
      <LeagueNav slug={league.slug} name={league.name} canManage={canManage} />

      <h1>Rankings</h1>

      {rankings.length === 0 ? (
        <p>No rankings yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ranking</th>
                <th>Method</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((ranking) => (
                <tr key={ranking.slug}>
                  <td>
                    <Link
                      route="rankings.show"
                      routeParams={{ league: league.slug, ranking: ranking.slug }}
                    >
                      {ranking.name}
                    </Link>
                  </td>
                  <td>{ranking.algorithm}</td>
                  <td>
                    {!ranking.hasRecompute
                      ? 'Never calculated'
                      : ranking.isStale
                        ? `${ranking.staleCount} tournaments since last update`
                        : 'Up to date'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <p>
          <Link className="button" route="rankings.create" routeParams={{ league: league.slug }}>
            Create a ranking
          </Link>
        </p>
      )}
    </>
  )
}

export default Rankings
