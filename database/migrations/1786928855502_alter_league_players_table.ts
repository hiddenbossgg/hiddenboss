import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'league_players'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('state').nullable()
      table.string('city').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('state')
      table.dropColumn('city')
    })
  }
}
