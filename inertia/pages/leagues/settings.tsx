import type React from 'react'
import { Form } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'
import { confirmSubmit } from '../../lib/confirm_submit.js'

type Props = {
  league: {
    slug: string
    name: string
    description: string | null
    visibility: string
    timezone: string | null
  }
  timezones: string[]
  canDelete: boolean
}

const Settings: React.FC<Props> = ({ league, timezones, canDelete }) => {
  return (
    <>
      <LeagueNav slug={league.slug} name={league.name} />

      <h1>Settings</h1>

      <Form route="leagues.update" routeParams={{ league: league.slug }}>
        {({ errors, processing }) => (
          <>
            <div>
              <label htmlFor="name">Name</label>
              <input type="text" name="name" id="name" defaultValue={league.name} />
              {errors.name && <p role="alert">{errors.name}</p>}
            </div>

            <div>
              <label htmlFor="description">Description</label>
              <textarea
                name="description"
                id="description"
                defaultValue={league.description ?? ''}
              />
              {errors.description && <p role="alert">{errors.description}</p>}
            </div>

            <div>
              <label htmlFor="visibility">Visibility</label>
              <select name="visibility" id="visibility" defaultValue={league.visibility}>
                <option value="public">Public — anyone can see standings</option>
                <option value="private">Private — visible to admins only</option>
              </select>
            </div>

            <div>
              <label htmlFor="timezone">Time zone</label>
              <select name="timezone" id="timezone" defaultValue={league.timezone ?? ''}>
                <option value="">UTC (default)</option>
                {timezones
                  .filter((zone) => zone !== 'UTC')
                  .map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
              </select>
              <small>Tournament dates are shown and edited in this zone. UTC by default.</small>
              {errors.timezone && <p role="alert">{errors.timezone}</p>}
            </div>

            <button type="submit" disabled={processing}>
              Save
            </button>
          </>
        )}
      </Form>

      <p>
        The league URL <code>/{league.slug}</code> cannot be changed, so links your community has
        already shared keep working.
      </p>

      {canDelete && (
        <details className="danger-zone">
          <summary>Destructive actions</summary>

          <Form route="leagues.clear" routeParams={{ league: league.slug }}>
            {({ processing }) => (
              <div className="danger-action">
                <p>
                  Wipes rankings, players and imported events. Admins, credentials and the game list
                  are kept, and re-importing brings data back.
                </p>
                <button
                  type="submit"
                  disabled={processing}
                  onClick={confirmSubmit(
                    `Clear ${league.name}? This deletes every ranking, player and imported event in this league. Admins, credentials and the league itself stay — you can re-import from scratch.`
                  )}
                >
                  Clear league data
                </button>
              </div>
            )}
          </Form>

          <Form route="leagues.destroy" routeParams={{ league: league.slug }}>
            {({ processing }) => (
              <div className="danger-action">
                <p>Removes the league itself, along with everything in it, permanently.</p>
                <button
                  type="submit"
                  disabled={processing}
                  onClick={confirmSubmit(
                    `Delete ${league.name}? This removes the league itself along with everything in it. This cannot be undone.`
                  )}
                >
                  Delete league
                </button>
              </div>
            )}
          </Form>
        </details>
      )}
    </>
  )
}

export default Settings
