import { BracketSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import Phase from '#models/phase'
import TournamentSet from '#models/tournament_set'

/**
 * start.gg's phase group, parry.gg's bracket. Sets are fetched one bracket at a
 * time on both, which makes this the unit of import progress.
 */
export default class Bracket extends compose(BracketSchema, withUuid) {
  @belongsTo(() => Phase)
  declare phase: BelongsTo<typeof Phase>

  @hasMany(() => TournamentSet)
  declare sets: HasMany<typeof TournamentSet>
}
