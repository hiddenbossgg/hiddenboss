import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ranking_standings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      /**
       * One entry per distinct tournament this standing counted, holding that
       * tournament's entrant count (null when the platform never reported
       * one). `events_counted` stays as the cheap total; this is what lets a
       * ranking's activity requirements ask about tournament size without a
       * recompute — the breakdown is already here, only the clauses change.
       */
      table.jsonb('tournament_entrant_counts').notNullable().defaultTo('[]')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('tournament_entrant_counts')
    })
  }
}
