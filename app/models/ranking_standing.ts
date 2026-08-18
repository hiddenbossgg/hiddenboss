import { RankingStandingSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import RankingRecompute from '#models/ranking_recompute'
import LeaguePlayer from '#models/league_player'

export default class RankingStanding extends compose(RankingStandingSchema, withUuid) {
  /**
   * `pg` sends a bare JS array as a Postgres array literal rather than JSON,
   * which a jsonb column rejects — an explicit `prepare` is needed for any
   * jsonb column holding an array; plain-object jsonb columns don't need one.
   */
  @column({ prepare: (value: Array<number | null>) => JSON.stringify(value) })
  declare tournamentEntrantCounts: Array<number | null>

  @belongsTo(() => RankingRecompute)
  declare rankingRecompute: BelongsTo<typeof RankingRecompute>

  @belongsTo(() => LeaguePlayer)
  declare leaguePlayer: BelongsTo<typeof LeaguePlayer>

  /** Postgres returns numeric as a string to preserve precision. */
  get numericValue() {
    return Number(this.value)
  }
}
