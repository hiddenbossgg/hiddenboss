import { RankingRecomputeSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import Ranking from '#models/ranking'
import RankingStanding from '#models/ranking_standing'

/**
 * One recompute of a ranking. Standings belong to a recompute rather than to the
 * ranking, so a recompute is atomic from a reader's point of view: the previous
 * run stays readable until the new one is complete.
 */
export default class RankingRecompute extends compose(RankingRecomputeSchema, withUuid) {
  @belongsTo(() => Ranking)
  declare ranking: BelongsTo<typeof Ranking>

  @hasMany(() => RankingStanding)
  declare standings: HasMany<typeof RankingStanding>
}
