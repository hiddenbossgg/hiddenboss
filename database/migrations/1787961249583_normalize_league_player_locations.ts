import { BaseSchema } from '@adonisjs/lucid/schema'
import { normalizeCountry, normalizeState } from '#lib/geo/country'

/**
 * Data-only backfill, no schema change. `league_players.country/state` is a
 * one-time snapshot taken from `platform_accounts` at first identity
 * resolution (`IdentityResolverService.createPlayer`) and never re-synced —
 * so a player created before country normalisation shipped (`ce6fcc4`) is
 * stuck with whatever raw value the platform reported ("United States"),
 * even though the account it came from has since self-healed to "US" on
 * every re-import. This runs the same normalisation once, directly against
 * the stored value, so existing players catch up.
 *
 * City is left alone — it is never normalised anywhere, by design.
 */
export default class extends BaseSchema {
  async up() {
    const rows = await this.db
      .from('league_players')
      .whereNotNull('country')
      .select('id', 'country', 'state')

    for (const row of rows) {
      const country = normalizeCountry(row.country)
      const state = normalizeState(row.state, country)

      if (country === row.country && state === row.state) continue

      await this.db
        .from('league_players')
        .where('id', row.id)
        .update({ country, state, updated_at: this.now() })
    }
  }

  /**
   * Not reversible: the pre-normalisation raw text ("United States" vs "US")
   * isn't retained anywhere once overwritten, so there is nothing to restore.
   */
  async down() {}
}
