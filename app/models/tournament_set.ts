import { SetSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import Bracket from '#models/bracket'
import Entrant from '#models/entrant'
import SetGame from '#models/set_game'

/**
 * One set.
 *
 * Named `TournamentSet` rather than `Set` to avoid shadowing the JavaScript global,
 * which means the table has to be declared explicitly.
 */
export default class TournamentSet extends compose(SetSchema, withUuid) {
  static table = 'sets'

  @belongsTo(() => Bracket)
  declare bracket: BelongsTo<typeof Bracket>

  @belongsTo(() => Entrant, { foreignKey: 'entrantAId' })
  declare entrantA: BelongsTo<typeof Entrant>

  @belongsTo(() => Entrant, { foreignKey: 'entrantBId' })
  declare entrantB: BelongsTo<typeof Entrant>

  @belongsTo(() => Entrant, { foreignKey: 'winnerEntrantId' })
  declare winner: BelongsTo<typeof Entrant>

  @hasMany(() => SetGame, { foreignKey: 'setId' })
  declare games: HasMany<typeof SetGame>

  /**
   * Only completed sets between two known entrants can move a rating. Byes,
   * pending sets and walkovers with a missing side are excluded here rather
   * than in each algorithm.
   */
  get isRatable() {
    return (
      this.state === 'completed' &&
      this.entrantAId !== null &&
      this.entrantBId !== null &&
      this.winnerEntrantId !== null
    )
  }
}
