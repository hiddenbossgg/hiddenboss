import { SetGameSelectionSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import SetGame from '#models/set_game'
import Entrant from '#models/entrant'

/** A character pick within one game of a set. */
export default class SetGameSelection extends compose(SetGameSelectionSchema, withUuid) {
  @belongsTo(() => SetGame)
  declare setGame: BelongsTo<typeof SetGame>

  @belongsTo(() => Entrant)
  declare entrant: BelongsTo<typeof Entrant>
}
