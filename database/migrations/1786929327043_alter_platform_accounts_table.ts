import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'platform_accounts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      /**
       * Raw, as the platform reported it — same treatment as `pronouns`.
       * Unconstrained rather than ISO alpha-2: unlike a tournament's
       * `countryCode`, start.gg's `User.location.country` is a display name
       * ("United States"), not a code.
       */
      table.string('country').nullable()
      table.string('state').nullable()
      table.string('city').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('country')
      table.dropColumn('state')
      table.dropColumn('city')
    })
  }
}
