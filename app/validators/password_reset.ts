import vine from '@vinejs/vine'

/**
 * Asking for a reset link.
 *
 * Deliberately no `exists` rule: a validation error for an unknown address would
 * turn this form into a way to test whether somebody has an account. The
 * controller treats a missing user as a silent no-op instead.
 */
export const requestResetValidator = vine.create({
  email: vine.string().trim().email().maxLength(254),
})

/** Choosing the new password. Same rules as signup, plus confirmation. */
export const resetPasswordValidator = vine.create({
  token: vine.string().trim().minLength(1),
  password: vine
    .string()
    .minLength(8)
    .maxLength(32)
    .confirmed({ confirmationField: 'passwordConfirmation' }),
})
