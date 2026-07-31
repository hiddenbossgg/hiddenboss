import { LeaguePlayerAccountSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import League from '#models/league'
import LeaguePlayer from '#models/league_player'
import PlatformAccount from '#models/platform_account'

/**
 * The mapping rankings actually read: which platform accounts are this league
 * player.
 */
export default class LeaguePlayerAccount extends compose(LeaguePlayerAccountSchema, withUuid) {
  @belongsTo(() => League)
  declare league: BelongsTo<typeof League>

  @belongsTo(() => LeaguePlayer)
  declare leaguePlayer: BelongsTo<typeof LeaguePlayer>

  @belongsTo(() => PlatformAccount)
  declare platformAccount: BelongsTo<typeof PlatformAccount>
}
