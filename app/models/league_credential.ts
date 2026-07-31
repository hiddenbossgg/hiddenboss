import { LeagueCredentialSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import encryption from '@adonisjs/core/services/encryption'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import League from '#models/league'

/**
 * A league's API credentials for one platform.
 *
 * Stored encrypted, and the decrypted values never leave the server: the
 * settings UI renders fields from the adapter's declared credential spec and
 * only ever writes them.
 */
export default class LeagueCredential extends compose(LeagueCredentialSchema, withUuid) {
  @belongsTo(() => League)
  declare league: BelongsTo<typeof League>

  get values(): Record<string, string> {
    const decrypted = encryption.decrypt<Record<string, string>>(this.encryptedValues)
    if (decrypted === null) {
      throw new Error(
        `Could not decrypt credentials for platform "${this.platformKey}". ` +
          'This usually means APP_KEY changed since they were saved.'
      )
    }

    return decrypted
  }

  set values(values: Record<string, string>) {
    this.encryptedValues = encryption.encrypt(values)
  }
}
