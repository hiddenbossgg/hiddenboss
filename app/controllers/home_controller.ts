import League from '#models/league'
import db from '@adonisjs/lucid/services/db'
import type { HttpContext } from '@adonisjs/core/http'

export default class HomeController {
  /**
   * The front door: public leagues anyone can browse, plus the leagues the
   * signed-in user administers.
   */
  async index({ auth, inertia }: HttpContext) {
    const user = auth.user

    const publicLeagues = await League.query()
      .where('visibility', 'public')
      .orderBy('name')
      .limit(24)

    const mine = user
      ? await League.query()
          .whereIn('id', db.from('league_admins').select('league_id').where('user_id', user.id))
          .orderBy('name')
      : []

    return inertia.render('home', {
      publicLeagues: publicLeagues.map((league) => ({
        slug: league.slug,
        name: league.name,
        description: league.description,
      })),
      myLeagues: mine.map((league) => ({
        slug: league.slug,
        name: league.name,
        visibility: league.visibility,
      })),
    })
  }
}
