import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'platform_accounts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      /**
       * Opaque per-platform handle for the account's public profile page —
       * start.gg's `user.discriminator` ("8958b6cd"), parry.gg's user id.
       * Often the same as `external_user_id`; distinct only where a platform
       * separates its account id from its profile key. Only the adapter that
       * wrote it turns it into a URL. Null where the platform has no such page,
       * or where the account predates this column and has not been re-imported.
       */
      table.string('profile_slug').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('profile_slug')
    })
  }
}
