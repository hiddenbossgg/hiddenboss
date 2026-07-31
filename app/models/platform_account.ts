import { PlatformAccountSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withUuid } from '#models/mixins/with_uuid'
import GlobalPlayer from '#models/global_player'

/**
 * One account on one platform, deduplicated across every tournament it appears
 * in by `(platform_key, external_user_id)`.
 */
export default class PlatformAccount extends compose(PlatformAccountSchema, withUuid) {
  @belongsTo(() => GlobalPlayer)
  declare globalPlayer: BelongsTo<typeof GlobalPlayer>

  /**
   * Lowercases, strips a sponsor prefix and collapses whitespace so
   * `TSM | Leffen` and `leffen` compare equal.
   *
   * Deliberately conservative: it does not attempt leetspeak or accent
   * folding, because this value also feeds trigram similarity, and being too
   * aggressive here collapses genuinely different players.
   */
  static normalizeTag(gamerTag: string): string {
    const withoutPrefix = gamerTag.includes('|')
      ? gamerTag.slice(gamerTag.lastIndexOf('|') + 1)
      : gamerTag

    return withoutPrefix.trim().toLowerCase().replace(/\s+/g, ' ')
  }
}
