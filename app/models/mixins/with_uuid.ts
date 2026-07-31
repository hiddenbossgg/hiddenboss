import { uuidv7 } from 'uuidv7'
import { BaseModel, beforeCreate } from '@adonisjs/lucid/orm'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'

/**
 * Gives a model an application-generated UUIDv7 primary key.
 *
 * Generated here rather than by Postgres because native `uuidv7()` only lands
 * in Postgres 18, and because having the id before the round trip lets the
 * import pipeline build a whole object graph in memory and insert it at once.
 *
 * v7 rather than v4 so ids sort by creation time, keeping index locality
 * closer to a bigint sequence than random uuids would manage.
 */
export function withUuid<T extends NormalizeConstructor<typeof BaseModel>>(superclass: T) {
  class WithUuid extends superclass {
    /**
     * Tells Lucid the key is ours, not the database's. Without it Lucid
     * locates rows for update and delete via `$primaryKeyValue` instead of the
     * original attribute, which is the wrong source once a key is assigned in
     * application code.
     */
    static selfAssignPrimaryKey = true

    @beforeCreate()
    static assignUuid(model: InstanceType<typeof BaseModel> & { id?: string }) {
      if (!model.id) {
        model.id = uuidv7()
      }
    }
  }

  return WithUuid
}
