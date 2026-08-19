import type React from 'react'
import { Form } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'
import ActivityRequirementsEditor from '../../components/activity_requirements_editor.js'

type Props = {
  league: { slug: string; name: string }
  ranking: {
    slug: string
    name: string
    startsAt: string | null
    endsAt: string | null
    activityRequirements: Array<{ count: number; minEntrants: number | null }>
    flagInactive: boolean
    dqPolicy: 'exclude_no_shows' | 'exclude_double_dq' | 'exclude_any_dq'
  }
}

const EditRanking: React.FC<Props> = ({ league, ranking }) => {
  return (
    <>
      <LeagueNav slug={league.slug} name={league.name} />

      <h1>Edit {ranking.name}</h1>

      <Form route="rankings.update" routeParams={{ league: league.slug, ranking: ranking.slug }}>
        {({ errors, processing }) => (
          <>
            <div>
              <label htmlFor="startsAt">Counts events from</label>
              <input
                type="date"
                name="startsAt"
                id="startsAt"
                defaultValue={ranking.startsAt ?? ''}
              />
              {errors.startsAt && <p role="alert">{errors.startsAt}</p>}
            </div>

            <div>
              <label htmlFor="endsAt">Counts events until</label>
              <input type="date" name="endsAt" id="endsAt" defaultValue={ranking.endsAt ?? ''} />
              <small>Leave both blank to count every imported event.</small>
              {errors.endsAt && <p role="alert">{errors.endsAt}</p>}
            </div>

            <ActivityRequirementsEditor
              league={league.slug}
              initial={ranking.activityRequirements}
              errors={errors}
            />

            <div>
              <label htmlFor="flagInactive">
                <input
                  type="checkbox"
                  name="flagInactive"
                  id="flagInactive"
                  defaultChecked={ranking.flagInactive}
                />
                Flag inactive players instead of hiding them
              </label>
              <small>Only matters if activity requirements are set above.</small>
            </div>

            <div>
              <label htmlFor="dqPolicy">When a player is DQ&apos;d</label>
              <select name="dqPolicy" id="dqPolicy" defaultValue={ranking.dqPolicy}>
                <option value="exclude_no_shows">
                  Don&apos;t count that tournament if they played no sets
                </option>
                <option value="exclude_double_dq">
                  Don&apos;t count that tournament if they were DQ&apos;d twice
                </option>
                <option value="exclude_any_dq">Don&apos;t count that tournament at all</option>
              </select>
              <small>Only matters if activity requirements are set above.</small>
              {errors.dqPolicy && <p role="alert">{errors.dqPolicy}</p>}
            </div>

            <button type="submit" disabled={processing}>
              Save
            </button>
          </>
        )}
      </Form>
    </>
  )
}

export default EditRanking
