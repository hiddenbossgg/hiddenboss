import limiter from '@adonisjs/limiter/services/main'
import mail from '@adonisjs/mail/services/main'
import User from '#models/user'
import ResetPasswordNotification from '#mails/reset_password_notification'
import { AuthTokenService } from '#services/auth/auth_token_service'
import { requestResetValidator, resetPasswordValidator } from '#validators/password_reset'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Forgotten-password recovery.
 *
 * Two rules shape everything here. The response never reveals whether an address
 * has an account, because this form is otherwise a free membership oracle for
 * anyone holding a list of emails. And requests are throttled, because otherwise
 * it is a free way to send mail to an address the requester does not own.
 */
export default class PasswordResetsController {
  async create({ inertia }: HttpContext) {
    return inertia.render('auth/forgot_password', {})
  }

  async store({ request, response, session }: HttpContext) {
    const { email } = await request.validateUsing(requestResetValidator)

    /**
     * Keyed on address and IP together. Per address alone lets one machine walk a
     * list; per IP alone lets a botnet hammer a single inbox.
     */
    const throttle = limiter.use({ requests: 3, duration: '15 mins' })
    const key = `password-reset:${email}:${request.ip()}`

    /**
     * `attempt`, not `penalize`: penalize only spends a request when the callback
     * throws, which is right for failed logins and exactly wrong here, where the
     * successful path is the one being abused.
     */
    const allowed = await throttle.attempt(key, async () => {
      const user = await User.findBy('email', email)

      /**
       * A missing user is not an error and is not reported. The work is skipped
       * but the response is identical, so the two cases cannot be told apart
       * from outside.
       */
      if (user) {
        const token = await new AuthTokenService().issue(user, 'password_reset')
        await mail.sendLater(new ResetPasswordNotification(user, token))
      }

      return true
    })

    if (allowed === undefined) {
      session.flash('error', 'Too many reset requests. Try again in a few minutes.')
      return response.redirect().back()
    }

    session.flash(
      'success',
      'If an account exists for that address, a reset link is on its way. It expires in an hour.'
    )

    return response.redirect().back()
  }

  /**
   * The form for choosing a new password.
   *
   * The token is verified but not consumed: someone opening the link should learn
   * whether it still works before typing anything, and looking should not burn
   * it.
   */
  async edit({ params, inertia }: HttpContext) {
    const user = await new AuthTokenService().verify(params.token, 'password_reset')

    return inertia.render('auth/reset_password', {
      token: params.token,
      valid: user !== null,
    })
  }

  async update({ request, response, session, auth }: HttpContext) {
    const { token, password } = await request.validateUsing(resetPasswordValidator)

    /** Consumed up front, so a link cannot be replayed even if what follows fails. */
    const user = await new AuthTokenService().redeem(token, 'password_reset')

    if (!user) {
      session.flash('error', 'That reset link has expired or has already been used.')
      return response.redirect().toRoute('password.create')
    }

    /** `withAuthFinder` rehashes on assignment, so this is the whole update. */
    user.password = password
    await user.save()

    await auth.use('web').login(user)
    session.flash('success', 'Your password has been changed.')

    return response.redirect().toRoute('home')
  }
}
