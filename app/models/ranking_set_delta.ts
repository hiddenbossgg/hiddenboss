import { RankingSetDeltaSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import LeaguePlayer from '#models/league_player'
import TournamentSet from '#models/tournament_set'
import RankingRecompute from '#models/ranking_recompute'
import Tournament from '#models/tournament'

/**
 * One rating delta, tied to the set that caused it — so a player can see
 * not just that their rating moved but which result moved it.
 */
export default class RankingSetDelta extends compose(RankingSetDeltaSchema, withUuid) {
  @belongsTo(() => RankingRecompute)
  declare rankingRecompute: BelongsTo<typeof RankingRecompute>

  @belongsTo(() => LeaguePlayer)
  declare leaguePlayer: BelongsTo<typeof LeaguePlayer>

  @belongsTo(() => TournamentSet, { foreignKey: 'setId' })
  declare set: BelongsTo<typeof TournamentSet>

  @belongsTo(() => Tournament)
  declare tournament: BelongsTo<typeof Tournament>
}
