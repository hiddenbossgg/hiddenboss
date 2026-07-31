import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import mail from '@adonisjs/mail/services/main'
import limiter from '@adonisjs/limiter/services/main'
import { DateTime } from 'luxon'
import AuthToken from '#models/auth_token'
import User from '#models/user'
import ResetPasswordNotification from '#mails/reset_password_notification'
import { AuthTokenService } from '#services/auth/auth_token_service'

/**
 * The security properties are the point of this flow, so they are what is
 * tested: tokens are unguessable and unreadable at rest, work once, expire, and
 * the request endpoint never reveals who has an account.
 */
test.group('password reset', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function seedUser(email = 'player@example.test') {
    return User.create({ email, password: 'original-password' })
  }

  test('stores only a hash, never the token itself', async ({ assert }) => {
    const user = await seedUser()
    const token = await new AuthTokenService().issue(user, 'password_reset')

    const record = await AuthToken.query().where('userId', user.id).firstOrFail()

    assert.notEqual(record.tokenHash, token)
    assert.lengthOf(record.tokenHash, 64, 'sha-256 hex')
    /** A database dump must not yield a working link. */
    assert.notInclude(JSON.stringify(record.toJSON()), token)
  })

  test('verifies a live token and rejects an unknown one', async ({ assert }) => {
    const user = await seedUser()
    const service = new AuthTokenService()
    const token = await service.issue(user, 'password_reset')

    const found = await service.verify(token, 'password_reset')
    assert.equal(found?.id, user.id)

    assert.isNull(await service.verify('not-a-real-token', 'password_reset'))
  })

  /** A link in an inbox must not stay a standing key to the account. */
  test('rejects an expired token', async ({ assert }) => {
    const user = await seedUser()
    const service = new AuthTokenService()
    const token = await service.issue(user, 'password_reset')

    await AuthToken.query()
      .where('userId', user.id)
      .update({ expires_at: DateTime.now().minus({ minutes: 1 }).toSQL() })

    assert.isNull(await service.verify(token, 'password_reset'))
  })

  test('redeeming a token consumes it, so it cannot be replayed', async ({ assert }) => {
    const user = await seedUser()
    const service = new AuthTokenService()
    const token = await service.issue(user, 'password_reset')

    const redeemed = await service.redeem(token, 'password_reset')
    assert.equal(redeemed?.id, user.id)
    assert.isNull(await service.redeem(token, 'password_reset'), 'second use must fail')
  })

  test('issuing a new token invalidates the previous one', async ({ assert }) => {
    const user = await seedUser()
    const service = new AuthTokenService()

    const first = await service.issue(user, 'password_reset')
    await service.issue(user, 'password_reset')

    assert.isNull(await service.verify(first, 'password_reset'))
  })

  test('verifying does not consume, so opening the link twice still works', async ({ assert }) => {
    const user = await seedUser()
    const service = new AuthTokenService()
    const token = await service.issue(user, 'password_reset')

    await service.verify(token, 'password_reset')
    assert.isNotNull(await service.verify(token, 'password_reset'))
  })

  test('emails a reset link to a known address', async ({ client }) => {
    const user = await seedUser()
    const { mails } = mail.fake()

    const response = await client
      .post('/password/forgot')
      .form({ email: user.email })
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)
    mails.assertQueued(ResetPasswordNotification)
    mail.restore()
  })

  /**
   * The response must be identical for an address with no account, or the form
   * becomes a way to test who has one.
   */
  test('says the same thing for an unknown address, and sends nothing', async ({
    assert,
    client,
  }) => {
    await seedUser()
    const { mails } = mail.fake()

    const known = await client
      .post('/password/forgot')
      .form({ email: 'player@example.test' })
      .withCsrfToken()
      .redirects(0)

    const unknown = await client
      .post('/password/forgot')
      .form({ email: 'nobody@example.test' })
      .withCsrfToken()
      .redirects(0)

    assert.equal(known.status(), unknown.status())
    assert.equal(known.header('location'), unknown.header('location'))

    mails.assertQueuedCount(1)
    mail.restore()
  })

  test('changes the password and rejects the old one', async ({ assert, client }) => {
    const user = await seedUser()
    const token = await new AuthTokenService().issue(user, 'password_reset')

    const response = await client
      .post('/password/reset')
      .form({
        token,
        password: 'a-brand-new-password',
        passwordConfirmation: 'a-brand-new-password',
      })
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)

    await assert.doesNotReject(() => User.verifyCredentials(user.email, 'a-brand-new-password'))
    await assert.rejects(() => User.verifyCredentials(user.email, 'original-password'))
  })

  test('refuses a reset with a spent token', async ({ assert, client }) => {
    const user = await seedUser()
    const service = new AuthTokenService()
    const token = await service.issue(user, 'password_reset')
    await service.redeem(token, 'password_reset')

    await client
      .post('/password/reset')
      .form({ token, password: 'another-password', passwordConfirmation: 'another-password' })
      .withCsrfToken()
      .redirects(0)

    /** The password must be untouched. */
    await assert.doesNotReject(() => User.verifyCredentials(user.email, 'original-password'))
  })
})

/**
 * Throttling gets its own group because the limiter's database store takes its
 * own connection, so its writes deadlock against a global transaction. These
 * tests clean up after themselves instead.
 */
test.group('password reset throttling', (group) => {
  const throttled = 'throttled@example.test'
  const other = 'other@example.test'

  group.each.setup(async () => {
    await limiter.clear()
    await User.query().whereIn('email', [throttled, other]).delete()
    await User.create({ email: throttled, password: 'original-password' })
    await User.create({ email: other, password: 'original-password' })

    return async () => {
      await User.query().whereIn('email', [throttled, other]).delete()
      await limiter.clear()
    }
  })

  /**
   * Without a working limit the endpoint is a free way to send mail to an inbox
   * nobody controls. This also catches the limiter being wired up with
   * `penalize`, which spends a request only when the callback throws — so the
   * successful path, the one being abused, would cost nothing.
   */
  test('stops sending after the third request for the same address', async ({ client }) => {
    const { mails } = mail.fake()

    for (let attempt = 0; attempt < 5; attempt++) {
      await client.post('/password/forgot').form({ email: throttled }).withCsrfToken().redirects(0)
    }

    mails.assertQueuedCount(3)
    mail.restore()
  })

  test('limits per address, so one exhausted sender does not block another', async ({ client }) => {
    const { mails } = mail.fake()

    for (let attempt = 0; attempt < 5; attempt++) {
      await client.post('/password/forgot').form({ email: throttled }).withCsrfToken().redirects(0)
    }
    await client.post('/password/forgot').form({ email: other }).withCsrfToken().redirects(0)

    mails.assertQueuedCount(4)
    mail.restore()
  })
})
