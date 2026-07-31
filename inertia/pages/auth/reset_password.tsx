import type React from 'react'
import { Form, Link } from '@adonisjs/inertia/react'

type Props = {
  token: string
  valid: boolean
}

/**
 * The link is checked before this renders, so an expired one says so instead of
 * letting somebody type a new password and only then be told it was pointless.
 */
const ResetPassword: React.FC<Props> = ({ token, valid }) => {
  if (!valid) {
    return (
      <div className="form-container">
        <div>
          <h1> Link expired </h1>
          <p>Reset links work once and last an hour. Ask for a new one.</p>
        </div>
        <p>
          <Link className="button" route="password.create">
            Send another link
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="form-container">
      <div>
        <h1> Choose a new password </h1>
      </div>

      <div>
        <Form route="password.update">
          {({ errors, processing }) => (
            <>
              <input type="hidden" name="token" value={token} />

              <div>
                <label htmlFor="password">New password</label>
                <input
                  type="password"
                  name="password"
                  id="password"
                  autoComplete="new-password"
                  data-invalid={errors.password ? 'true' : undefined}
                />
                {errors.password && <div>{errors.password}</div>}
              </div>

              <div>
                <label htmlFor="passwordConfirmation">Confirm new password</label>
                <input
                  type="password"
                  name="passwordConfirmation"
                  id="passwordConfirmation"
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" disabled={processing}>
                Change password
              </button>
            </>
          )}
        </Form>
      </div>
    </div>
  )
}

export default ResetPassword
