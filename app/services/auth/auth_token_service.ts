import { createHash } from 'node:crypto'
import stringHelpers from '@adonisjs/core/helpers/string'
import { DateTime } from 'luxon'
import AuthToken from '#models/auth_token'
import User from '#models/user'
import type { AuthTokenType } from '#models/auth_token'

/**
 * How long a password reset stays usable. Long enough to find the email, short
 * enough that an old one in an inbox is not a standing key to the account.
 */
const LIFETIME = { hour: 1 }

/** 32 bytes, hex-encoded. Guessing one is not a realistic attack. */
const TOKEN_BYTES = 32

/**
 * Issues and redeems the single-use tokens sent by email.
 *
 * The plaintext token exists in exactly two places: the email, and the return
 * value of `issue`. Only its SHA-256 hash is stored, so a database dump cannot
 * be turned into account access — the same reason a password is hashed.
 *
 * A plain hash rather than bcrypt is deliberate and sufficient here: the token
 * is 32 random bytes, so there is no dictionary to attack, and lookup has to be
 * by exact match rather than by iterating every row.
 */
export class AuthTokenService {
  /**
   * Creates a token for the user and returns the plaintext, which the caller
   * must email and then discard.
   *
   * Any earlier token of the same type is consumed first, so requesting a second
   * reset link immediately invalidates the first.
   */
  async issue(user: User, type: AuthTokenType): Promise<string> {
    await AuthToken.query()
      .where('userId', user.id)
      .where('type', type)
      .whereNull('consumedAt')
      .update({ consumed_at: DateTime.now().toSQL() })

    const token = stringHelpers.generateRandom(TOKEN_BYTES)

    await AuthToken.create({
      userId: user.id,
      type,
      tokenHash: hash(token),
      expiresAt: DateTime.now().plus(LIFETIME),
    })

    return token
  }

  /**
   * The user a token belongs to, or null if it is unknown, expired, already
   * used, or of the wrong type.
   *
   * Does not consume it: the reset form has to check a token before showing
   * itself, and doing that should not burn the token.
   */
  async verify(token: string, type: AuthTokenType): Promise<User | null> {
    const record = await this.live(token, type)
    if (!record) return null

    return User.find(record.userId)
  }

  /**
   * Verifies and consumes in one step, returning the user.
   *
   * Consuming before the caller acts is what stops a link being replayed — if
   * the password update then fails, the user asks for a new link, which is the
   * safe direction to fail in.
   */
  async redeem(token: string, type: AuthTokenType): Promise<User | null> {
    const record = await this.live(token, type)
    if (!record) return null

    record.consumedAt = DateTime.now()
    await record.save()

    return User.find(record.userId)
  }

  private async live(token: string, type: AuthTokenType): Promise<AuthToken | null> {
    if (!token) return null

    const record = await AuthToken.query()
      .where('tokenHash', hash(token))
      .where('type', type)
      .whereNull('consumedAt')
      .where('expiresAt', '>', DateTime.now().toSQL()!)
      .first()

    return record ?? null
  }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
