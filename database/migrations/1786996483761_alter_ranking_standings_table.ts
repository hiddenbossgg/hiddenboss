import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ranking_standings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('tournament_entrant_counts')
    })

    this.schema.alterTable(this.tableName, (table) => {
      /**
       * One entry per distinct tournament this standing counted:
       * `{ entrantCount, setsPlayed, timesDisqualified }`. Renamed and
       * widened from `tournament_entrant_counts` so a ranking's DQ policy
       * can be applied at read time too — `setsPlayed` and
       * `timesDisqualified` are what tell a no-show from a tournament the
       * player actually competed in and were later disqualified from.
       */
      table.jsonb('tournament_activity').notNullable().defaultTo('[]')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('tournament_activity')
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('tournament_entrant_counts').notNullable().defaultTo('[]')
    })
  }
}
