import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'leagues'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      /**
       * IANA identifier (e.g. "America/New_York"), null meaning "not set" —
       * dates fall back to UTC, matching behaviour before this column
       * existed. Tournament timestamps are stored as correct UTC instants;
       * this is only what a league's calendar dates are read back in, since
       * an evening-local tournament's instant already falls on the next UTC
       * day.
       */
      table.string('timezone').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('timezone')
    })
  }
}
