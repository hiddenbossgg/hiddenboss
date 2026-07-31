import { LeagueEventSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import League from '#models/league'
import Event from '#models/event'

/**
 * One event a league counts.
 *
 * Keyed on the event rather than the tournament because a tournament runs
 * several and a league usually wants one of them — the singles bracket, not the
 * doubles alongside it. A tournament belongs to a league only by way of its
 * events.
 */
export default class LeagueEvent extends compose(LeagueEventSchema, withUuid) {
  @belongsTo(() => League)
  declare league: BelongsTo<typeof League>

  @belongsTo(() => Event)
  declare event: BelongsTo<typeof Event>
}
