import User from '#models/user'
import League from '#models/league'
import LeagueAdmin from '#models/league_admin'
import { BasePolicy, allowGuest } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'

/**
 * Authorisation for a single league.
 *
 * Membership is looked up per check rather than cached on the user, because a
 * user may administer many leagues and only the one in the current request
 * matters.
 */
export default class LeaguePolicy extends BasePolicy {
  /**
   * Public leagues are readable by anyone, including logged-out visitors —
   * public standings are the product. Private leagues are visible only to their
   * admins.
   */
  @allowGuest()
  async view(user: User | null, league: League): Promise<AuthorizerResponse> {
    if (league.isPublic) {
      return true
    }

    return user ? this.isAdmin(user, league) : false
  }

  /** Anything that changes the league or the data it counts. */
  async manage(user: User, league: League): Promise<AuthorizerResponse> {
    return this.isAdmin(user, league)
  }

  /** Destroying a league takes its tournament links and rankings with it. */
  async delete(user: User, league: League): Promise<AuthorizerResponse> {
    return this.hasRole(user, league, ['owner'])
  }

  private async isAdmin(user: User, league: League): Promise<boolean> {
    if (user.isInstanceAdmin) {
      return true
    }

    const membership = await LeagueAdmin.query()
      .where('leagueId', league.id)
      .where('userId', user.id)
      .first()

    return membership !== null
  }

  private async hasRole(user: User, league: League, roles: string[]): Promise<boolean> {
    if (user.isInstanceAdmin) {
      return true
    }

    const membership = await LeagueAdmin.query()
      .where('leagueId', league.id)
      .where('userId', user.id)
      .whereIn('role', roles)
      .first()

    return membership !== null
  }
}
