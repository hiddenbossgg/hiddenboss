import { RankingSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import League from '#models/league'
import RankingRecompute from '#models/ranking_recompute'

export default class Ranking extends compose(RankingSchema, withUuid) {
  @belongsTo(() => League)
  declare league: BelongsTo<typeof League>

  @hasMany(() => RankingRecompute)
  declare recomputes: HasMany<typeof RankingRecompute>

  @belongsTo(() => RankingRecompute, { foreignKey: 'latestRecomputeId' })
  declare latestRecompute: BelongsTo<typeof RankingRecompute>

  /** Standings are behind the data and an admin has not yet asked for a recompute. */
  get isStale() {
    return this.recomputeRequestedAt !== null
  }

  get updatesAutomatically() {
    return this.recomputeMode === 'auto'
  }
}
