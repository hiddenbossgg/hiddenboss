import { IdentityCorrectionService } from '#services/identity/identity_correction_service'
import { reassignAccountValidator } from '#validators/identity'
import type { ReassignResult } from '#services/identity/identity_correction_service'
import type { HttpContext } from '@adonisjs/core/http'

function outcome(result: ReassignResult): string {
  if (result.created) return 'Split out into a new player.'
  if (result.tombstoned) return 'Merged.'
  return 'Account reassigned.'
}

/**
 * Admin corrections to who an imported account belongs to.
 *
 * Lives alongside the event pages because that is where a mistake is visible:
 * you recognise two rows as the same person by looking at a bracket, not at a
 * list of names.
 */
export default class IdentityCorrectionsController {
  async update({ league, auth, request, response, session }: HttpContext) {
    const payload = await request.validateUsing(reassignAccountValidator)

    const result = await new IdentityCorrectionService().reassign({
      leagueId: league.id,
      platformAccountId: payload.platformAccountId,
      target: payload.leaguePlayerId
        ? { existingPlayerId: payload.leaguePlayerId }
        : { newPlayerTag: payload.newPlayerTag! },
      actorUserId: auth.getUserOrFail().id,
    })

    session.flash(
      'success',
      `${outcome(result)} Rankings are marked stale — update them when you are done correcting.`
    )

    return response.redirect().back()
  }
}
