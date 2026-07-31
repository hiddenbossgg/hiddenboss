import vine from '@vinejs/vine'

/**
 * Moving one platform account to a different league player, either an existing
 * one or a new one named here.
 *
 * Exactly one of the two arrives: `requiredIfMissing` in both directions rejects
 * a request carrying neither, and the form only ever fills one.
 *
 * Ids are checked against this league in the service rather than here: a
 * cross-league id is an authorisation problem, not a shape problem, and must not
 * read as a validation hint that the other league exists.
 */
export const reassignAccountValidator = vine.create({
  platformAccountId: vine.string().uuid(),
  leaguePlayerId: vine.string().uuid().optional().requiredIfMissing('newPlayerTag'),
  newPlayerTag: vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(80)
    .optional()
    .requiredIfMissing('leaguePlayerId'),
})
