import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'rankings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      /**
       * A list of `{ count, minEntrants }` clauses, all of which a league
       * player must satisfy within the ranking's date range to appear on the
       * standings page — e.g. 3 tournaments with 8+ entrants AND 5
       * tournaments of any size. `minEntrants: null` means any size.
       *
       * Deliberately not part of `requirements`: that jsonb feeds the
       * recompute fingerprint, and changing these clauses should never
       * trigger a recompute — each standing already stores the entrant count
       * of every tournament it counted, so a new set of clauses is just a
       * different read-time filter over data that has not changed.
       */
      table.jsonb('activity_requirements').notNullable().defaultTo('[]')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('activity_requirements')
    })
  }
}
