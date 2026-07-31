import { AuthTokenSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import User from '#models/user'

/** What a token is for. Adding a kind here does not need a migration. */
export type AuthTokenType = 'password_reset'

/**
 * A single-use credential sent by email.
 *
 * Only the hash is stored, so this model can never hand out a working token —
 * see `AuthTokenService`, which is the only thing that should create or redeem
 * one.
 */
export default class AuthToken extends compose(AuthTokenSchema, withUuid) {
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
