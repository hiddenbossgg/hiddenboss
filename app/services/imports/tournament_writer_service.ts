import db from '@adonisjs/lucid/services/db'
import Entrant from '#models/entrant'
import EntrantParticipant from '#models/entrant_participant'
import Event from '#models/event'
import TournamentSet from '#models/tournament_set'
import Phase from '#models/phase'
import PlatformAccount from '#models/platform_account'
import Bracket from '#models/bracket'
import SetGame from '#models/set_game'
import SetGameSelection from '#models/set_game_selection'
import Tournament from '#models/tournament'
import { normalizeCountry } from '#lib/geo/normalize_country'
import { normalizeState } from '#lib/geo/normalize_state'
import { DateTime } from 'luxon'
import type {
  CanonicalBracket,
  CanonicalEntrant,
  CanonicalEvent,
  CanonicalPhase,
  CanonicalTournament,
} from '#lib/platforms/canonical'

/**
 * Writes canonical records into the database, one transaction per call, so
 * memory stays bounded and a mid-import failure leaves earlier brackets saved.
 *
 * Every write is an upsert keyed on `(parent, external_id)`: queue delivery is
 * at-least-once, so a replayed job must not duplicate rows.
 *
 * One instance per import — it holds the external id to row id translation for
 * the tournament it is writing, so instances must not be shared.
 */
export class TournamentWriterService {
  private readonly platformKey: string

  /** external id -> row id, so later calls can resolve their parents. */
  private readonly eventIds = new Map<string, string>()
  private readonly phaseIds = new Map<string, string>()
  private readonly entrantIds = new Map<string, string>()

  private tournamentRowId: string | null = null

  constructor(platformKey: string) {
    this.platformKey = platformKey
  }

  /** Returns the row id, which the caller needs to link the import record. */
  async writeTournament(tournament: CanonicalTournament): Promise<string> {
    return db.transaction(async (trx) => {
      const country = normalizeCountry(tournament.country)

      const row = await Tournament.updateOrCreate(
        { platformKey: this.platformKey, externalId: tournament.externalId },
        {
          slug: tournament.slug,
          name: tournament.name,
          url: tournament.url,
          startAt: toDateTime(tournament.startAt),
          endAt: toDateTime(tournament.endAt),
          country,
          state: normalizeState(tournament.state, country),
          city: tournament.city,
          address: tournament.address,
          isOnline: tournament.isOnline,
          importedAt: DateTime.now(),
        },
        { client: trx }
      )

      this.tournamentRowId = row.id
      return row.id
    })
  }

  /** Returns the row id, which the caller needs to link the league to it. */
  async writeEvent(event: CanonicalEvent): Promise<string> {
    const tournamentId = this.requireTournament()

    return db.transaction(async (trx) => {
      const row = await Event.updateOrCreate(
        { tournamentId, externalId: event.externalId },
        {
          name: event.name,
          gameName: event.game,
          entryKind: event.entryKind,
          teamSize: event.teamSize,
          entrantCount: event.entrantCount,
        },
        { client: trx }
      )

      this.eventIds.set(event.externalId, row.id)
      return row.id
    })
  }

  async writePhase(eventExternalId: string, phase: CanonicalPhase): Promise<void> {
    const eventId = this.requireEvent(eventExternalId)

    await db.transaction(async (trx) => {
      const row = await Phase.updateOrCreate(
        { eventId, externalId: phase.externalId },
        { name: phase.name, order: phase.order },
        { client: trx }
      )

      this.phaseIds.set(phase.externalId, row.id)
    })
  }

  /**
   * Entrants also create the platform accounts behind them, which is where a
   * person first enters the system. Accounts are global and deduplicated across
   * every tournament by `(platform, external_user_id)`.
   */
  async writeEntrants(eventExternalId: string, entrants: CanonicalEntrant[]): Promise<void> {
    const eventId = this.requireEvent(eventExternalId)

    await db.transaction(async (trx) => {
      for (const entrant of entrants) {
        const row = await Entrant.updateOrCreate(
          { eventId, externalId: entrant.externalId },
          {
            name: entrant.name,
            seed: entrant.seed,
            placement: entrant.placement,
            isDisqualified: entrant.isDisqualified,
          },
          { client: trx }
        )

        this.entrantIds.set(entrant.externalId, row.id)

        for (const participant of entrant.participants) {
          /**
           * Platforms with no cross-tournament account get a synthesised id
           * scoped to this entrant, and are flagged so identity resolution
           * knows it can only match them by tag.
           */
          const weakIdentity = participant.externalUserId === null
          const externalUserId =
            participant.externalUserId ?? `entrant:${eventId}:${entrant.externalId}`

          const account = await PlatformAccount.updateOrCreate(
            { platformKey: this.platformKey, externalUserId },
            {
              gamerTag: participant.gamerTag,
              prefix: participant.prefix,
              pronouns: participant.pronouns,
              country: participant.country,
              state: participant.state,
              city: participant.city,
              normalizedTag: PlatformAccount.normalizeTag(participant.gamerTag),
              weakIdentity,
            },
            { client: trx }
          )

          await EntrantParticipant.updateOrCreate(
            { entrantId: row.id, platformAccountId: account.id },
            {},
            { client: trx }
          )
        }
      }
    })
  }

  async writeBracket(phaseExternalId: string, bracket: CanonicalBracket): Promise<void> {
    const phaseId = this.requirePhase(phaseExternalId)

    await db.transaction(async (trx) => {
      const bracketRow = await Bracket.updateOrCreate(
        { phaseId, externalId: bracket.externalId },
        { name: bracket.name, bracketType: bracket.bracketType },
        { client: trx }
      )

      for (const set of bracket.sets) {
        const setRow = await TournamentSet.updateOrCreate(
          { bracketId: bracketRow.id, externalId: set.externalId },
          {
            state: set.state,
            round: set.round,
            identifier: set.identifier,
            fullRoundText: set.fullRoundText,
            ordinal: set.ordinal,
            entrantAId: this.entrantId(set.entrantAExternalId),
            entrantBId: this.entrantId(set.entrantBExternalId),
            winnerEntrantId: this.entrantId(set.winnerEntrantExternalId),
            scoreA: set.scoreA,
            scoreB: set.scoreB,
            entrantADisqualified: set.entrantADisqualified,
            entrantBDisqualified: set.entrantBDisqualified,
            completedAt: toDateTime(set.completedAt),
          },
          { client: trx }
        )

        for (const game of set.games) {
          const gameRow = await SetGame.updateOrCreate(
            { setId: setRow.id, number: game.number },
            {
              winnerEntrantId: this.entrantId(game.winnerEntrantExternalId),
              stageName: game.stage,
            },
            { client: trx }
          )

          /**
           * Selections have no natural key of their own, so a re-import
           * replaces the game's set rather than trying to match them up.
           */
          await SetGameSelection.query({ client: trx }).where('setGameId', gameRow.id).delete()

          for (const selection of game.selections) {
            const entrantId = this.entrantId(selection.entrantExternalId)
            if (!entrantId) continue

            await SetGameSelection.create(
              {
                setGameId: gameRow.id,
                entrantId,
                characterName: selection.character,
              },
              { client: trx }
            )
          }
        }
      }
    })
  }

  private entrantId(externalId: string | null): string | null {
    if (externalId === null) return null
    return this.entrantIds.get(externalId) ?? null
  }

  /**
   * These enforce the ordering contract at write time. A sink can be called in
   * any order, so failing loudly here is what stops an adapter bug from writing
   * orphaned rows.
   */
  private requireTournament(): string {
    if (!this.tournamentRowId) {
      throw new Error('Received a record before the tournament')
    }
    return this.tournamentRowId
  }

  private requireEvent(externalId: string): string {
    const id = this.eventIds.get(externalId)
    if (!id) {
      throw new Error(`Received a record for unknown event "${externalId}"`)
    }
    return id
  }

  private requirePhase(externalId: string): string {
    const id = this.phaseIds.get(externalId)
    if (!id) {
      throw new Error(`Received a bracket for unknown phase "${externalId}"`)
    }
    return id
  }
}

function toDateTime(value: Date | null): DateTime | null {
  return value ? DateTime.fromJSDate(value) : null
}
