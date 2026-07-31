import type React from 'react'
import { Form } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'

type Props = {
  league: {
    slug: string
    name: string
    description: string | null
    visibility: string
  }
}

const Settings: React.FC<Props> = ({ league }) => {
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
    </>
  )
}

export default Settings
