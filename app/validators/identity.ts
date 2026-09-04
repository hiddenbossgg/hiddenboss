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

const resolution = () => vine.string().trim().maxLength(100).nullable().optional()

/**
 * Merging one league player into another. Beyond the two ids, the form sends a chosen value for
 * every field the two rows disagree on. Validate these chosen conflict resolutions.
 */
export const mergePlayersValidator = vine.create({
  survivorId: vine.string().uuid(),
  mergedId: vine.string().uuid(),
  displayTag: resolution(),
  city: resolution(),
  state: resolution(),
  country: resolution(),
  pronouns: resolution(),
  globalPlayerId: vine.string().uuid().nullable().optional(),
})
