import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * `flag_inactive` chose whether an ineligible player was dropped or kept and
 * marked — now moved off the ranking entirely: the standings page always
 * sends every player, flagged, and a viewer's own "exclude inactive players"
 * checkbox decides what's shown, same as the H2H page.
 */
export default class extends BaseSchema {
  protected tableName = 'rankings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('flag_inactive')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('flag_inactive').notNullable().defaultTo(false)
    })
  }
}
