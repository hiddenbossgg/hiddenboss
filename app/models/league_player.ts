import { LeaguePlayerSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import League from '#models/league'
import GlobalPlayer from '#models/global_player'
import LeaguePlayerAccount from '#models/league_player_account'

/**
 * Who counts as one competitor within one league.
 *
 * League admins own this. Because it is league-scoped, correcting a bad match
 * here can never disturb another league's history.
 */
export default class LeaguePlayer extends compose(LeaguePlayerSchema, withUuid) {
  @belongsTo(() => League)
  declare league: BelongsTo<typeof League>

  @belongsTo(() => GlobalPlayer)
  declare globalPlayer: BelongsTo<typeof GlobalPlayer>

  @hasMany(() => LeaguePlayerAccount)
  declare accounts: HasMany<typeof LeaguePlayerAccount>

  /** A merged-away player is kept for reversibility but never ranked. */
  get isMerged() {
    return this.mergedIntoId !== null
  }
}
