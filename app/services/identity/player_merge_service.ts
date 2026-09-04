import db from '@adonisjs/lucid/services/db'
import GlobalPlayer from '#models/global_player'
import IdentityEvent from '#models/identity_event'
import League from '#models/league'
import LeaguePlayer from '#models/league_player'
import LeaguePlayerAccount from '#models/league_player_account'
import Ranking from '#models/ranking'
import { StalenessService } from '#services/rankings/staleness_service'

/**
 * The fields a merge has to reconcile between the two rows. Everything else on a
 * league player is either identity (`slug`, kept from the survivor so its URLs
 * hold) or derived by a recompute.
 */
const RECONCILED_FIELDS = [
  'displayTag',
  'city',
  'state',
  'country',
  'pronouns',
  'globalPlayerId',
] as const

export type ReconciledField = (typeof RECONCILED_FIELDS)[number]

/** Every field but the tag can be resolved to empty; both rows always have a tag. */
type ClearableField = Exclude<ReconciledField, 'displayTag'>

const FIELD_LABELS: Record<ReconciledField, string> = {
  displayTag: 'Display tag',
  city: 'City',
  state: 'State/province',
  country: 'Country',
  pronouns: 'Pronouns',
  globalPlayerId: 'Linked global player',
}

/**
 * `agree` — both rows carry the same value, nothing to decide. Every other
 * status needs the admin to pick a value: `only-a`/`only-b` where one side is
 * empty (picking the empty side clears the field), `conflict` where both are
 * populated and differ.
 */
export type FieldStatus = 'agree' | 'only-a' | 'only-b' | 'conflict'

export interface FieldComparison {
  key: ReconciledField
  label: string
  a: string | null
  b: string | null
  /** Human-readable stand-in shown instead of a raw id (global player only). */
  aLabel: string | null
  bLabel: string | null
  status: FieldStatus
}

export interface PlayerSummary {
  id: string
  slug: string
  displayTag: string
  accountCount: number
  /** Rank in the league's default ranking, or null if unrated there. */
  rank: number | null
  setsPlayed: number
}

export interface SharedEvent {
  eventId: string
  label: string
}

export interface MergePreview {
  a: PlayerSummary
  b: PlayerSummary
  /** Which row to keep by default: rated, else more accounts, else older. */
  suggestedPrimary: 'a' | 'b'
  fields: FieldComparison[]
  /** Events both players entered — a merge combines their record there. */
  sharedEvents: SharedEvent[]
}

export interface MergeRequest {
  leagueId: string
  survivorId: string
  mergedId: string
  /**
   * A chosen value for every field the two rows disagree on. `null` picks the
   * empty side; `undefined` (the key absent) is an unresolved conflict.
   */
  resolutions: Partial<Record<ReconciledField, string | null | undefined>>
  actorUserId: string | null
}

export interface MergeResult {
  survivorId: string
  survivorSlug: string
  survivorDisplayTag: string
  mergedDisplayTag: string
  movedAccounts: number
  sharedEventCount: number
}

/**
 * Raised when a conflicting field arrives without a resolution, or with one that
 * is neither row's value. The controller turns this into a flash message rather
 * than a 500 — it means the form and the data drifted apart, not a bug.
 */
export class UnresolvedMergeConflictError extends Error {
  constructor(public field: ReconciledField) {
    super(`No valid choice supplied for "${FIELD_LABELS[field]}"`)
    this.name = 'UnresolvedMergeConflictError'
  }
}

/**
 * Merging two league players the admin has recognised as the same person.
 *
 * A merge is a bulk reassignment: every one of the merged row's accounts moves
 * to the survivor, the merged row is tombstoned rather than deleted so its URLs
 * keep resolving and the merge can be undone, and an `identity_events` row
 * records what moved and which field values the survivor had beforehand.
 *
 * Field reconciliation is entirely the admin's: every field the two rows
 * disagree on — a real conflict, or one side simply being empty — comes back
 * from `preview` for a decision, and `merge` refuses to run without one.
 */
export class PlayerMergeService {
  async preview(input: {
    leagueId: string
    playerAId: string
    playerBId: string
  }): Promise<MergePreview> {
    const { leagueId, playerAId, playerBId } = input

    if (playerAId === playerBId) {
      throw new Error('A player cannot be merged into itself')
    }

    const a = await this.loadPlayer(leagueId, playerAId)
    const b = await this.loadPlayer(leagueId, playerBId)

    const [summaries, fields, sharedEvents] = await Promise.all([
      this.summarise(leagueId, [a, b]),
      this.compareFields(a, b),
      this.sharedEvents(leagueId, a.id, b.id),
    ])

    const [summaryA, summaryB] = summaries

    return {
      a: summaryA,
      b: summaryB,
      suggestedPrimary: this.suggestPrimary(summaryA, summaryB),
      fields,
      sharedEvents,
    }
  }

  async merge(request: MergeRequest): Promise<MergeResult> {
    const { leagueId, survivorId, mergedId, resolutions, actorUserId } = request

    if (survivorId === mergedId) {
      throw new Error('A player cannot be merged into itself')
    }

    const survivor = await this.loadPlayer(leagueId, survivorId)
    const merged = await this.loadPlayer(leagueId, mergedId)

    const applied = this.reconcile(survivor, merged, resolutions)

    const shared = await this.sharedEvents(leagueId, survivor.id, merged.id)
    const sharedEventIds = shared.map((event) => event.eventId)

    const before: Record<string, string | null> = {}
    for (const key of RECONCILED_FIELDS) before[key] = survivor[key] ?? null

    const mergedAccounts = await LeaguePlayerAccount.query()
      .where('leagueId', leagueId)
      .where('leaguePlayerId', merged.id)
      .select('platformAccountId')
    const movedAccountIds = mergedAccounts.map((row) => row.platformAccountId)

    await db.transaction(async (trx) => {
      await LeaguePlayerAccount.query({ client: trx })
        .where('leagueId', leagueId)
        .where('leaguePlayerId', merged.id)
        .update({
          league_player_id: survivor.id,
          /** The admin has asserted these are one person, so nothing automatic. */
          source: 'manual',
          provisional: false,
          confidence: '1',
          confirmed_by_user_id: actorUserId,
        })

      survivor.useTransaction(trx)
      survivor.merge(applied.changes)
      for (const key of applied.cleared) survivor[key] = null
      /** Survivor keys win; the merged row only fills gaps. */
      if (Object.keys(merged.socials ?? {}).length > 0) {
        survivor.socials = { ...merged.socials, ...survivor.socials }
      }
      await survivor.save()

      await LeaguePlayer.query({ client: trx })
        .where('id', merged.id)
        .update({ merged_into_id: survivor.id })

      await IdentityEvent.create(
        {
          leagueId,
          actorUserId,
          kind: 'merge',
          payload: {
            survivorLeaguePlayerId: survivor.id,
            mergedLeaguePlayerId: merged.id,
            movedPlatformAccountIds: movedAccountIds,
            resolutions: applied.resolved,
            /** So an un-merge can put the survivor's own fields back. */
            survivorBefore: before,
            sharedEventIds,
          },
        },
        { client: trx }
      )

      /** Standings were built on the old mapping; the version bump tells readers. */
      await League.query({ client: trx }).where('id', leagueId).increment('identity_version', 1)
    })

    await new StalenessService().markLeagueStale(leagueId)

    return {
      survivorId: survivor.id,
      survivorSlug: survivor.slug,
      survivorDisplayTag: survivor.displayTag,
      mergedDisplayTag: merged.displayTag,
      movedAccounts: movedAccountIds.length,
      sharedEventCount: sharedEventIds.length,
    }
  }

  /**
   * Scoped to the league on the way in and refusing a row that is itself a
   * tombstone, so a stale id fails here rather than corrupting the graph.
   */
  private loadPlayer(leagueId: string, playerId: string): Promise<LeaguePlayer> {
    return LeaguePlayer.query()
      .where('id', playerId)
      .where('leagueId', leagueId)
      .whereNull('mergedIntoId')
      .firstOrFail()
  }

  private normalize(value: string | null): string | null {
    const trimmed = (value ?? '').trim()
    return trimmed === '' ? null : trimmed
  }

  private async compareFields(a: LeaguePlayer, b: LeaguePlayer): Promise<FieldComparison[]> {
    const globalIds = [a.globalPlayerId, b.globalPlayerId].filter((id): id is string => id !== null)
    const globalPlayers =
      globalIds.length > 0
        ? await GlobalPlayer.query().whereIn('id', globalIds).select('id', 'displayTag')
        : []
    const globalTag = new Map(globalPlayers.map((player) => [player.id, player.displayTag]))

    const labelFor = (key: ReconciledField, value: string | null) =>
      key === 'globalPlayerId' && value !== null ? (globalTag.get(value) ?? value) : null

    const comparisons: FieldComparison[] = []

    for (const key of RECONCILED_FIELDS) {
      const aValue = this.normalize(a[key] as string | null)
      const bValue = this.normalize(b[key] as string | null)

      // Both empty is nothing to reconcile — except the tag, which is always shown.
      if (aValue === null && bValue === null && key !== 'displayTag') continue

      let status: FieldStatus
      if (aValue !== null && bValue !== null) status = aValue === bValue ? 'agree' : 'conflict'
      else if (aValue !== null) status = 'only-a'
      else if (bValue !== null) status = 'only-b'
      else status = 'agree'

      comparisons.push({
        key,
        label: FIELD_LABELS[key],
        a: aValue,
        b: bValue,
        aLabel: labelFor(key, aValue),
        bLabel: labelFor(key, bValue),
        status,
      })
    }

    return comparisons
  }

  /**
   * Works in survivor/merged terms rather than a/b. Every field the two rows
   * disagree on needs a resolution that matches one row's value — which may be
   * the empty one, clearing the field. A field the rows agree on is left alone;
   * a missing or invalid resolution for a disagreement is refused.
   */
  private reconcile(
    survivor: LeaguePlayer,
    merged: LeaguePlayer,
    resolutions: MergeRequest['resolutions']
  ): {
    changes: Partial<Record<ReconciledField, string>>
    cleared: ClearableField[]
    resolved: Record<string, string | null>
  } {
    const changes: Partial<Record<ReconciledField, string>> = {}
    const cleared: ClearableField[] = []
    const resolved: Record<string, string | null> = {}

    for (const key of RECONCILED_FIELDS) {
      const sv = this.normalize(survivor[key] as string | null)
      const mg = this.normalize(merged[key] as string | null)

      if (sv === mg) continue

      const raw = resolutions[key]
      if (raw === undefined) throw new UnresolvedMergeConflictError(key)

      const choice = this.normalize(raw)
      if (choice !== sv && choice !== mg) throw new UnresolvedMergeConflictError(key)

      resolved[key] = choice
      if (choice === sv) continue
      if (choice !== null) {
        changes[key] = choice
      } else if (key !== 'displayTag') {
        // The tag is never empty on either row, so this only ever clears the rest.
        cleared.push(key)
      }
    }

    return { changes, cleared, resolved }
  }

  private async summarise(leagueId: string, players: LeaguePlayer[]): Promise<PlayerSummary[]> {
    const ids = players.map((player) => player.id)

    const accountRows = await LeaguePlayerAccount.query()
      .where('leagueId', leagueId)
      .whereIn('leaguePlayerId', ids)
      .select('leaguePlayerId')
      .count('* as total')
      .groupBy('leaguePlayerId')
    const accountCount = new Map(
      accountRows.map((row) => [row.leaguePlayerId, Number(row.$extras.total)])
    )

    const ranking = await Ranking.query()
      .where('leagueId', leagueId)
      .whereNotNull('latestRecomputeId')
      .orderBy('published', 'desc')
      .orderBy('name')
      .first()

    const standings = ranking?.latestRecomputeId
      ? await db
          .from('ranking_standings')
          .where('ranking_recompute_id', ranking.latestRecomputeId)
          .whereIn('league_player_id', ids)
          .select('league_player_id', 'rank', 'sets_played')
      : []
    const standingBy = new Map(standings.map((row) => [row.league_player_id, row]))

    return players.map((player) => ({
      id: player.id,
      slug: player.slug,
      displayTag: player.displayTag,
      accountCount: accountCount.get(player.id) ?? 0,
      rank: standingBy.get(player.id)?.rank ?? null,
      setsPlayed: standingBy.get(player.id)?.sets_played ?? 0,
    }))
  }

  private suggestPrimary(a: PlayerSummary, b: PlayerSummary): 'a' | 'b' {
    if ((a.rank === null) !== (b.rank === null)) return a.rank !== null ? 'a' : 'b'
    if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank < b.rank ? 'a' : 'b'
    if (a.accountCount !== b.accountCount) return a.accountCount > b.accountCount ? 'a' : 'b'
    return 'a'
  }

  /**
   * Events both players entered, via any of their accounts, restricted to what
   * this league counts. A doubles bracket puts two real people on one entrant,
   * so an overlap here is not proof of a mistake — hence a warning, not a block.
   */
  private async sharedEvents(leagueId: string, aId: string, bId: string): Promise<SharedEvent[]> {
    const rows = await db
      .from('league_player_accounts as lpa')
      .innerJoin('entrant_participants as ep', 'ep.platform_account_id', 'lpa.platform_account_id')
      .innerJoin('entrants as en', 'en.id', 'ep.entrant_id')
      .innerJoin('events as e', 'e.id', 'en.event_id')
      .innerJoin('league_events as le', (join) =>
        join.on('le.event_id', '=', 'e.id').andOnVal('le.league_id', leagueId)
      )
      .innerJoin('tournaments as t', 't.id', 'e.tournament_id')
      .where('lpa.league_id', leagueId)
      .whereIn('lpa.league_player_id', [aId, bId])
      .groupBy('e.id', 'e.name', 't.name')
      .havingRaw('count(distinct lpa.league_player_id) = 2')
      .select('e.id as event_id', 'e.name as event_name', 't.name as tournament_name')

    return rows.map((row) => ({
      eventId: row.event_id,
      label: `${row.tournament_name} — ${row.event_name}`,
    }))
  }
}
