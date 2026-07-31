import { GlobalPlayerSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import PlatformAccount from '#models/platform_account'

/**
 * A person, instance-wide. Accounts attach here only on confirmed evidence,
 * never on tag similarity.
 */
export default class GlobalPlayer extends compose(GlobalPlayerSchema, withUuid) {
  @hasMany(() => PlatformAccount)
  declare accounts: HasMany<typeof PlatformAccount>
}
