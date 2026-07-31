import { EventSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import Tournament from '#models/tournament'
import Phase from '#models/phase'
import Entrant from '#models/entrant'

export default class Event extends compose(EventSchema, withUuid) {
  @belongsTo(() => Tournament)
  declare tournament: BelongsTo<typeof Tournament>

  @hasMany(() => Phase)
  declare phases: HasMany<typeof Phase>

  @hasMany(() => Entrant)
  declare entrants: HasMany<typeof Entrant>

  get isTeamEvent() {
    return this.entryKind !== 'singles'
  }
}
