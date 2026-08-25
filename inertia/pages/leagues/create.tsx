import type React from 'react'
import { Form } from '@adonisjs/inertia/react'

type Props = {
  timezones: string[]
}

const CreateLeague: React.FC<Props> = ({ timezones }) => {
  return (
    <>
      <h1>Create a league</h1>

      <Form route="leagues.store">
        {({ errors, processing }) => (
          <>
            <div>
              <label htmlFor="name">Name</label>
              <input type="text" name="name" id="name" />
              {errors.name && <p role="alert">{errors.name}</p>}
            </div>

            <div>
              <label htmlFor="slug">URL</label>
              <input type="text" name="slug" id="slug" placeholder="texas-rivals" />
              <small>
                Your league will live at /your-league. This cannot be changed later, so links your
                community shares keep working.
              </small>
              {errors.slug && <p role="alert">{errors.slug}</p>}
            </div>

            <div>
              <label htmlFor="description">Description</label>
              <textarea name="description" id="description" />
              {errors.description && <p role="alert">{errors.description}</p>}
            </div>

            <div>
              <label htmlFor="visibility">Visibility</label>
              <select name="visibility" id="visibility" defaultValue="public">
                <option value="public">Public — anyone can see standings</option>
                <option value="private">Private — visible to admins only</option>
              </select>
            </div>

            <div>
              <label htmlFor="timezone">Time zone</label>
              <select name="timezone" id="timezone" defaultValue="">
                <option value="">UTC (default)</option>
                {timezones
                  .filter((zone) => zone !== 'UTC')
                  .map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
              </select>
              <small>Tournament dates are shown and edited in this zone.</small>
              {errors.timezone && <p role="alert">{errors.timezone}</p>}
            </div>

            <button type="submit" disabled={processing}>
              Create league
            </button>
          </>
        )}
      </Form>
    </>
  )
}

export default CreateLeague
