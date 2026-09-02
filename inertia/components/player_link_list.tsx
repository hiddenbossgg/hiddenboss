import type React from 'react'
import { Fragment } from 'react'
import { Link } from '@adonisjs/inertia/react'

type Props = {
  leagueSlug: string
  /** An entrant is 1..N players, so doubles teams and crews render every member. */
  players: ReadonlyArray<{ slug: string | null; label: string }>
  separator?: string
  empty?: string
}

/** A player with no resolved league profile has no slug, so it renders as plain text. */
const PlayerLinkList: React.FC<Props> = ({
  leagueSlug,
  players,
  separator = ' & ',
  empty = '—',
}) => {
  if (players.length === 0) return <>{empty}</>

  return (
    <>
      {players.map((player, index) => (
        <Fragment key={player.slug ?? `${player.label}-${index}`}>
          {index > 0 && separator}
          {player.slug ? (
            <Link route="players.show" routeParams={{ league: leagueSlug, player: player.slug }}>
              {player.label}
            </Link>
          ) : (
            player.label
          )}
        </Fragment>
      ))}
    </>
  )
}

export default PlayerLinkList
