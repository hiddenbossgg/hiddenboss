import { RankingStandingSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import RankingRecompute from '#models/ranking_recompute'
import LeaguePlayer from '#models/league_player'

export default class RankingStanding extends compose(RankingStandingSchema, withUuid) {
  @belongsTo(() => RankingRecompute)
  declare rankingRecompute: BelongsTo<typeof RankingRecompute>

  @belongsTo(() => LeaguePlayer)
  declare leaguePlayer: BelongsTo<typeof LeaguePlayer>

  /** Postgres returns numeric as a string to preserve precision. */
  get numericValue() {
    return Number(this.value)
  }
}
