import { BaseSeeder } from '@adonisjs/lucid/seeders'
import logger from '@adonisjs/core/services/logger'
import League from '#models/league'
import LeagueAdmin from '#models/league_admin'
import User from '#models/user'

/**
 * A signed-in admin and a league to work with, so local testing does not begin
 * with filling in two forms.
 *
 * Safe to re-run: everything is keyed on a stable identifier.
 */
export default class extends BaseSeeder {
  /** Guards against ever running this against a real database. */
  static environment = ['development', 'test']

  async run() {
    const user = await User.updateOrCreate(
      { email: 'dev@hiddenboss.test' },
      { password: 'password', fullName: 'Dev Admin' }
    )

    const league = await League.updateOrCreate(
      { slug: 'dev-league' },
      {
        name: 'Dev League',
        description: 'Seeded for local development.',
        visibility: 'public',
        createdByUserId: user.id,
      }
    )

    await LeagueAdmin.updateOrCreate({ leagueId: league.id, userId: user.id }, { role: 'owner' })

    logger.info('Seeded dev@hiddenboss.test / password  ->  /dev-league')
  }
}
