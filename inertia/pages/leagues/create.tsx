import type React from 'react'
import { Form } from '@adonisjs/inertia/react'

const CreateLeague: React.FC = () => {
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
