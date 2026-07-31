import { BaseMail } from '@adonisjs/mail'
import env from '#start/env'
import type User from '#models/user'

/**
 * The one email that carries a working reset token.
 *
 * Plain text rather than a template: it is three lines, and the fewer places the
 * token is interpolated the fewer places it can leak into a log or a preview.
 */
export default class ResetPasswordNotification extends BaseMail {
  subject = 'Reset your hiddenboss password'

  constructor(
    private user: User,
    private token: string
  ) {
    super()
  }

  prepare() {
    const url = `${env.get('APP_URL')}/password/reset/${this.token}`

    this.message
      .to(this.user.email)
      .text(
        [
          'Someone asked to reset the password for this hiddenboss account.',
          '',
          `Open this link to choose a new one: ${url}`,
          '',
          'The link works once and expires in an hour.',
          'If this was not you, nothing has changed and you can ignore this email.',
        ].join('\n')
      )
  }
}
