import { RankingTournamentStandingSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import LeaguePlayer from '#models/league_player'
import RankingRecompute from '#models/ranking_recompute'
import Tournament from '#models/tournament'

/**
 * A player's rank and rating as at one tournament, for plotting against time.
 */
export default class RankingTournamentStanding extends compose(
  RankingTournamentStandingSchema,
  withUuid
) {
  @belongsTo(() => RankingRecompute)
  declare rankingRecompute: BelongsTo<typeof RankingRecompute>

  @belongsTo(() => LeaguePlayer)
  declare leaguePlayer: BelongsTo<typeof LeaguePlayer>

  @belongsTo(() => Tournament)
  declare tournament: BelongsTo<typeof Tournament>
}
