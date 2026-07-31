import { PhaseSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import Event from '#models/event'
import Bracket from '#models/bracket'

export default class Phase extends compose(PhaseSchema, withUuid) {
  @belongsTo(() => Event)
  declare event: BelongsTo<typeof Event>

  @hasMany(() => Bracket)
  declare brackets: HasMany<typeof Bracket>
}
