import { LeagueSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import LeagueAdmin from '#models/league_admin'
import LeaguePlayer from '#models/league_player'
import LeagueEvent from '#models/league_event'
import Ranking from '#models/ranking'

export default class League extends compose(LeagueSchema, withUuid) {
  @hasMany(() => LeagueAdmin)
  declare admins: HasMany<typeof LeagueAdmin>

  @hasMany(() => LeaguePlayer)
  declare players: HasMany<typeof LeaguePlayer>

  @hasMany(() => LeagueEvent)
  declare tournaments: HasMany<typeof LeagueEvent>

  @hasMany(() => Ranking)
  declare rankings: HasMany<typeof Ranking>

  get isPublic() {
    return this.visibility === 'public'
  }
}
