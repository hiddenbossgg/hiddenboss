import { TournamentSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import Event from '#models/event'

/**
 * Canonical tournament data, stored once per instance and shared by every
 * league that counts it.
 */
export default class Tournament extends compose(TournamentSchema, withUuid) {
  @hasMany(() => Event)
  declare events: HasMany<typeof Event>
}
