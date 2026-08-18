import type React from 'react'
import { useState } from 'react'
import { Form, Link } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'
import { useLiveUpdates } from '../../hooks/use_live_updates.js'

type Props = {
  league: { slug: string; name: string }
  canManage: boolean
  ranking: {
    slug: string
    name: string
    algorithm: string
    isStale: boolean
    staleCount: number
    hasRecompute: boolean
    isRecomputing: boolean
    startsAt: string | null
    endsAt: string | null
    activityRequirements: Array<{ count: number; minEntrants: number | null }>
    flagInactive: boolean
  }
  standings: Array<{
    rank: number
    previousRank: number | null
    player: string
    playerSlug: string
    rating: number
    wins: number
    losses: number
    setsPlayed: number
    eventsCounted: number
    inactive: boolean
  }>
}

/** Places gained or lost since the previous recompute. */
function rankDelta(rank: number, previousRank: number | null) {
  if (previousRank === null) return 'new'
  const delta = previousRank - rank
  if (delta === 0) return '–'
  return delta > 0 ? `▲ ${delta}` : `▼ ${Math.abs(delta)}`
}

const RankingPage: React.FC<Props> = ({ league, canManage, ranking, standings }) => {
  /**
   * Set when the button is pressed, to cover the gap before a worker picks the
   * job up and reports itself as running. It needs no reset: completing the
   * recompute clears `recomputeRequestedAt`, which drops `isStale` and with it
   * the whole term.
   */
  const [requested, setRequested] = useState(false)
  const working = ranking.isRecomputing || (requested && ranking.isStale)
  const { gaveUp } = useLiveUpdates(working, { only: ['ranking', 'standings'] })

  return (
    <>
      <LeagueNav slug={league.slug} name={league.name} canManage={canManage} />

      <h1>{ranking.name}</h1>

      {(ranking.startsAt || ranking.endsAt || ranking.activityRequirements.length > 0) && (
        <p>
          {ranking.startsAt || ranking.endsAt
            ? `Counts events from ${ranking.startsAt ?? 'the start'} to ${ranking.endsAt ?? 'now'}.`
            : null}
          {ranking.activityRequirements.length > 0 && (
            <>
              {' '}
              To meet required activity, a player needs{' '}
              {ranking.activityRequirements
                .map(
                  (requirement) =>
                    `at least ${requirement.count} tournament${requirement.count === 1 ? '' : 's'}${requirement.minEntrants ? ` with ${requirement.minEntrants}+ entrants` : ' of any size'}`
                )
                .join(', and ')}
              {ranking.flagInactive ? ' — otherwise they are flagged inactive.' : '.'}
            </>
          )}
        </p>
      )}

      {/*
        Standings are recomputed on request rather than on every import, so the
        page has to say plainly how far behind it is.
      */}
      {ranking.isStale && (
        <p>
          {ranking.hasRecompute
            ? `${ranking.staleCount} tournament${ranking.staleCount === 1 ? '' : 's'} imported since these standings were last updated.`
            : 'These standings have not been calculated yet.'}
        </p>
      )}

      {working && !gaveUp && <p role="status">Updating standings…</p>}
      {gaveUp && (
        <p role="status">
          Still waiting. Recomputes run in a separate worker process, so check that{' '}
          <code>node ace queue:work</code> is running, then reload.
        </p>
      )}

      {canManage && (
        <>
          <Form
            route="rankings.recompute"
            routeParams={{ league: league.slug, ranking: ranking.slug }}
            onSuccess={() => setRequested(true)}
          >
            {({ processing }) => (
              <button type="submit" disabled={processing || working}>
                {working ? 'Updating…' : 'Update rankings'}
              </button>
            )}
          </Form>{' '}
          <Link route="rankings.edit" routeParams={{ league: league.slug, ranking: ranking.slug }}>
            Edit date range &amp; activity requirements
          </Link>
        </>
      )}

      {standings.length === 0 ? (
        <p>No standings yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Move</th>
                <th>Player</th>
                <th>Rating</th>
                <th>W–L</th>
                <th>Sets</th>
                <th>Events</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((standing) => (
                <tr key={standing.playerSlug}>
                  <td>{standing.rank}</td>
                  <td>{rankDelta(standing.rank, standing.previousRank)}</td>
                  <td>
                    <Link
                      route="players.show"
                      routeParams={{ league: league.slug, player: standing.playerSlug }}
                    >
                      {standing.player}
                    </Link>
                    {standing.inactive && ' · inactive'}
                  </td>
                  <td>{standing.rating}</td>
                  <td>
                    {standing.wins}–{standing.losses}
                  </td>
                  <td>{standing.setsPlayed}</td>
                  <td>{standing.eventsCounted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default RankingPage
