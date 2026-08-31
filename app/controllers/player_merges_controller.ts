import LeaguePlayer from '#models/league_player'
import LeaguePolicy from '#policies/league_policy'
import {
  PlayerMergeService,
  UnresolvedMergeConflictError,
} from '#services/identity/player_merge_service'
import { mergePlayersValidator } from '#validators/identity'
import type { MergePreview } from '#services/identity/player_merge_service'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Combining two league players.
 *
 * The page is a compare-then-confirm: pick two players, see which fields the
 * rows disagree on and whether they have events in common, then commit. All of
 * it is manage-gated by the route group.
 */
export default class PlayerMergesController {
  async show({ league, bouncer, request, inertia }: HttpContext) {
    const players = await LeaguePlayer.query()
      .where('leagueId', league.id)
      .whereNull('mergedIntoId')
      .orderBy('displayTag')

    const aId = request.input('a')
    const bId = request.input('b')

    let preview: MergePreview | null = null
    if (typeof aId === 'string' && typeof bId === 'string' && aId !== bId) {
      preview = await new PlayerMergeService()
        .preview({ leagueId: league.id, playerAId: aId, playerBId: bId })
        // A stale or cross-league id just leaves the pickers empty-handed.
        .catch(() => null)
    }

    return inertia.render('leagues/players_merge', {
      league: { slug: league.slug, name: league.name },
      canManage: await bouncer.with(LeaguePolicy).allows('manage', league),
      players: players.map((player) => ({
        id: player.id,
        slug: player.slug,
        displayTag: player.displayTag,
      })),
      selected: {
        a: typeof aId === 'string' ? aId : null,
        b: typeof bId === 'string' ? bId : null,
      },
      preview,
    })
  }

  async store({ league, auth, request, response, session }: HttpContext) {
    const payload = await request.validateUsing(mergePlayersValidator)

    if (payload.survivorId === payload.mergedId) {
      session.flash('error', 'Pick two different players to merge.')
      return response.redirect().back()
    }

    try {
      const result = await new PlayerMergeService().merge({
        leagueId: league.id,
        survivorId: payload.survivorId,
        mergedId: payload.mergedId,
        resolutions: {
          displayTag: payload.displayTag,
          city: payload.city,
          state: payload.state,
          country: payload.country,
          pronouns: payload.pronouns,
          globalPlayerId: payload.globalPlayerId,
        },
        actorUserId: auth.getUserOrFail().id,
      })

      session.flash(
        'success',
        `Merged ${result.mergedDisplayTag} into ${result.survivorDisplayTag}. ` +
          'Rankings are marked stale — update them when you are done correcting.'
      )

      return response
        .redirect()
        .toRoute('players.show', { league: league.slug, player: result.survivorSlug })
    } catch (error) {
      if (error instanceof UnresolvedMergeConflictError) {
        session.flash('error', `${error.message}. Choose a value and try again.`)
        return response.redirect().back()
      }
      throw error
    }
  }
}
