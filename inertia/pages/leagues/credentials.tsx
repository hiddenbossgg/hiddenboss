import type React from 'react'
import { Form } from '@adonisjs/inertia/react'
import LeagueNav from '../../components/league_nav.js'

type Props = {
  league: { slug: string; name: string }
  platforms: Array<{
    key: string
    displayName: string
    configured: boolean
    fields: Array<{ name: string; label: string; help: string | null; secret: boolean }>
  }>
}

/**
 * Every field here comes from the adapter's own declaration, so adding a
 * platform needs no change to this page.
 */
const Credentials: React.FC<Props> = ({ league, platforms }) => {
  return (
    <>
      <LeagueNav slug={league.slug} name={league.name} />

      <h1>Platform credentials</h1>
      <p>
        Keys are stored encrypted and never sent back to your browser. Each league supplies its own,
        so the rate limit for one league cannot affect another.
      </p>

      {platforms.map((platform) => (
        <section key={platform.key}>
          <h2>
            {platform.displayName}
            {platform.configured && <span> — configured</span>}
          </h2>

          <Form
            route="credentials.update"
            routeParams={{ league: league.slug, platform: platform.key }}
          >
            {({ errors, processing }) => (
              <>
                {platform.fields.map((field) => (
                  <div key={field.name}>
                    <label htmlFor={`${platform.key}-${field.name}`}>{field.label}</label>
                    <input
                      type={field.secret ? 'password' : 'text'}
                      name={field.name}
                      id={`${platform.key}-${field.name}`}
                      autoComplete="off"
                    />
                    {field.help && <small>{field.help}</small>}
                    {errors[field.name] && <p role="alert">{errors[field.name]}</p>}
                  </div>
                ))}

                <button type="submit" disabled={processing}>
                  {platform.configured ? 'Replace' : 'Save'} credentials
                </button>
              </>
            )}
          </Form>
        </section>
      ))}
    </>
  )
}

export default Credentials
