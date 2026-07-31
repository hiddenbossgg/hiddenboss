import { EntrantSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import Event from '#models/event'
import EntrantParticipant from '#models/entrant_participant'

/**
 * A competitor slot: one person for singles, several for doubles or crews.
 *
 * Identity resolution never joins from here directly — it goes through
 * participants, so team events resolve to several players.
 */
export default class Entrant extends compose(EntrantSchema, withUuid) {
  @belongsTo(() => Event)
  declare event: BelongsTo<typeof Event>

  @hasMany(() => EntrantParticipant)
  declare participants: HasMany<typeof EntrantParticipant>
}
