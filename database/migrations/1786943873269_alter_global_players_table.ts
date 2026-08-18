import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'global_players'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      /** Same widening as `league_players.country` — see that migration. */
      table.string('country').alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('country', 2).alter()
    })
  }
}
