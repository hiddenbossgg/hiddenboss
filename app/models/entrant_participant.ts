import { EntrantParticipantSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import Entrant from '#models/entrant'
import PlatformAccount from '#models/platform_account'

export default class EntrantParticipant extends compose(EntrantParticipantSchema, withUuid) {
  @belongsTo(() => Entrant)
  declare entrant: BelongsTo<typeof Entrant>

  @belongsTo(() => PlatformAccount)
  declare platformAccount: BelongsTo<typeof PlatformAccount>
}
