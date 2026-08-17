import db from '@adonisjs/lucid/services/db'

/**
 * Wipes a league's data back to empty while keeping the league itself.
 *
 * Deletes exactly what `League.delete()` cascades minus configuration and
 * membership — `league_admins`, `league_games` and `league_credentials`
 * survive, since those are settings an admin re-entering everything would
 * not thank us for losing. Everything else here cascades from the five
 * tables deleted below: rankings take their recomputes, standings, set
 * deltas and tournament standings with them; league players take their
 * platform account links with them.
 *
 * Canonical tournament, event and platform-account data is untouched —
 * instance-wide, and may be counted by another league. A subsequent import
 * upserts the same rows and re-links them, the same as removing one event.
 */
export class LeagueClearingService {
  async run(leagueId: string): Promise<void> {
    await db.transaction(async (trx) => {
      await trx.from('rankings').where('league_id', leagueId).delete()
      await trx.from('league_players').where('league_id', leagueId).delete()
      await trx.from('league_events').where('league_id', leagueId).delete()
      await trx.from('identity_events').where('league_id', leagueId).delete()
      await trx.from('event_imports').where('league_id', leagueId).delete()
    })
  }
}
