import { Form, Link } from '@adonisjs/inertia/react'

export default function ForgotPassword() {
  return (
    <div className="form-container">
      <div>
        <h1> Reset your password </h1>
        <p>We will email you a link to choose a new one.</p>
      </div>

      <div>
        <Form route="password.store">
          {({ errors, processing }) => (
            <>
              <div>
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  autoComplete="username"
                  data-invalid={errors.email ? 'true' : undefined}
                />
                {errors.email && <div>{errors.email}</div>}
              </div>

              <button type="submit" disabled={processing}>
                Send reset link
              </button>
            </>
          )}
        </Form>

        <p>
          <Link route="session.create">Back to login</Link>
        </p>
      </div>
    </div>
  )
}
