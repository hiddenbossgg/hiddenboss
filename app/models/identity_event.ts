import { IdentityEventSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import League from '#models/league'
import User from '#models/user'

/**
 * Append-only log of identity changes.
 *
 * What makes a merge reversible: the mapping itself records only where an
 * account points now, so without this there would be no record of where it
 * pointed before, or who moved it.
 */
export default class IdentityEvent extends compose(IdentityEventSchema, withUuid) {
  @belongsTo(() => League)
  declare league: BelongsTo<typeof League>

  @belongsTo(() => User, { foreignKey: 'actorUserId' })
  declare actor: BelongsTo<typeof User>
}
