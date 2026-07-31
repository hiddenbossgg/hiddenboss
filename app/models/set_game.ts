import { SetGameSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import TournamentSet from '#models/tournament_set'
import SetGameSelection from '#models/set_game_selection'

export default class SetGame extends compose(SetGameSchema, withUuid) {
  @belongsTo(() => TournamentSet, { foreignKey: 'setId' })
  declare set: BelongsTo<typeof TournamentSet>

  @hasMany(() => SetGameSelection)
  declare selections: HasMany<typeof SetGameSelection>
}
