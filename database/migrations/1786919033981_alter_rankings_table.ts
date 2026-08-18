import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'rankings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      /**
       * Default false to preserve today's behaviour: a player failing an
       * `activity_requirements` clause is dropped from standings entirely.
       * Set true to keep them on the page with a flag instead — same
       * read-time filter in `RankingsController#show`, just applied as an
       * annotation rather than an exclusion.
       */
      table.boolean('flag_inactive').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('flag_inactive')
    })
  }
}
