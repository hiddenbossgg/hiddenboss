import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'league_players'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      /**
       * Was ISO alpha-2, on the assumption every platform reports a country
       * code. Widened after start.gg's `User.location.country` turned out to
       * be a display name ("United States"), not a code — seeded from
       * `platform_accounts.country`, which is the same raw string.
       */
      table.string('country').alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('country', 2).alter()
    })
  }
}
