import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'rankings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      /**
       * How a tournament where the player was disqualified counts toward
       * activity requirements: `exclude_no_shows` (default) drops it only
       * when they played nothing before the DQ, `exclude_double_dq` drops it
       * once they were disqualified twice, `exclude_any_dq` drops it on any
       * DQ at all. Applied at read time in `RankingsController#show`, same
       * as `activity_requirements` and `flag_inactive` — the raw per-set
       * facts are already on each standing, so a policy change needs no
       * recompute.
       */
      table.string('dq_policy').notNullable().defaultTo('exclude_no_shows')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('dq_policy')
    })
  }
}
