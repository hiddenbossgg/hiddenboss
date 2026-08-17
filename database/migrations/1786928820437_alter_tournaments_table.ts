import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'tournaments'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      /**
       * Replaces `location`, which every adapter was already lossily
       * flattening into one string (start.gg concatenates city/state/country
       * itself; the structure was sitting right there in the API response,
       * just discarded). Kept as separate columns rather than normalised,
       * unvalidated platform strings.
       */
      table.string('country', 2).nullable()
      table.string('state').nullable()
      table.string('city').nullable()
      table.text('address').nullable()
      table.dropColumn('location')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('location').nullable()
      table.dropColumn('country')
      table.dropColumn('state')
      table.dropColumn('city')
      table.dropColumn('address')
    })
  }
}
