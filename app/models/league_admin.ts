import { LeagueAdminSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import League from '#models/league'
import User from '#models/user'

/**
 * Ties a user to a league. `owner` is currently the only role issued; the
 * column exists so finer roles need no schema change.
 */
export default class LeagueAdmin extends compose(LeagueAdminSchema, withUuid) {
  @belongsTo(() => League)
  declare league: BelongsTo<typeof League>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
