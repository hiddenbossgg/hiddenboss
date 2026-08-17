import vine from '@vinejs/vine'
import {
  ENTRANTS_PER_PAGE,
  EVENT_ENTRANTS_QUERY,
  EVENT_QUERY,
  MIN_PER_PAGE,
  PHASE_GROUP_SETS_QUERY,
  SETS_PER_PAGE,
  TOURNAMENT_EVENTS_QUERY,
} from './queries.js'
import { PermanentPlatformError, TransientPlatformError } from '#lib/platforms/errors'
import type {
  BracketType,
  CanonicalEntrant,
  CanonicalSet,
  EntryKind,
  SetState,
} from '#lib/platforms/canonical'
import type {
  CredentialsSpec,
  ImportSink,
  PlatformAdapter,
  PlatformContext,
  EventRef,
} from '#lib/platforms/contracts'

const ENDPOINT = 'https://api.start.gg/gql/alpha'

/**
 * start.gg's bracket type enum.
 * https://developer.start.gg/reference/brackettype.doc
 */
const BRACKET_TYPES: Record<string, BracketType> = {
  SINGLE_ELIMINATION: 'single_elimination',
  DOUBLE_ELIMINATION: 'double_elimination',
  ROUND_ROBIN: 'round_robin',
  SWISS: 'swiss',
}

/** start.gg activity states: 1 created, 2 started, 3 completed. */
const SET_STATES: Record<number, SetState> = {
  1: 'pending',
  2: 'started',
  3: 'completed',
}

export class StartggAdapter implements PlatformAdapter {
  readonly key = 'startgg'
  readonly displayName = 'start.gg'

  /**
   * Documented at roughly 80 requests per 60 seconds per token. Deliberately
   * set below that: the cost of being slightly slow is a longer import, while
   * the cost of being slightly fast is a league's key getting throttled.
   */
  readonly rateLimit = { requests: 60, perSeconds: 60 }

  readonly credentials: CredentialsSpec = {
    schema: vine.object({ token: vine.string().trim().minLength(10) }),
    fields: [
      {
        name: 'token',
        label: 'Personal access token',
        help: 'Create one at start.gg → Developer Settings → Personal Access Tokens.',
        secret: true,
      },
    ],
  }

  /**
   * Pulls the event out of a start.gg link.
   *
   * A link naming only a tournament still resolves to a ref, carrying the bare
   * tournament slug. `fetchEvent` turns that into a message listing the events
   * to choose from — returning null instead would report the URL as belonging to
   * no supported platform, which is both wrong and a dead end for the admin.
   */
  matchUrl(url: string): EventRef | null {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return null
    }

    if (!['start.gg', 'www.start.gg', 'smash.gg', 'www.smash.gg'].includes(parsed.hostname)) {
      return null
    }

    const segments = parsed.pathname.split('/').filter(Boolean)

    const tournamentAt = segments.indexOf('tournament')
    const tournamentSlug = tournamentAt === -1 ? undefined : segments[tournamentAt + 1]
    if (!tournamentSlug) return null

    /**
     * Deep links carry more path after the event slug — `/brackets/123/456`,
     * `/overview` — so only the segment straight after `event` is taken. The
     * plural `/events` listing page has no event segment and falls through to
     * the tournament form.
     */
    const eventAt = segments.indexOf('event')
    const eventSlug = eventAt === -1 ? undefined : segments[eventAt + 1]

    return {
      platform: this.key,
      slug: eventSlug ? `tournament/${tournamentSlug}/event/${eventSlug}` : tournamentSlug,
      url,
    }
  }

  async fetchEvent(ref: EventRef, context: PlatformContext, sink: ImportSink): Promise<void> {
    if (!ref.slug.includes('/event/')) {
      await this.rejectTournamentLink(context, ref)
    }

    const result = await this.query<any>(context, EVENT_QUERY, { slug: ref.slug })
    const node = result.event

    if (!node) {
      throw new PermanentPlatformError(`start.gg has no event at "${ref.slug}"`, {
        platform: this.key,
      })
    }

    const tournament = node.tournament
    if (!tournament) {
      throw new PermanentPlatformError(
        `start.gg returned event "${node.name}" with no tournament attached`,
        { platform: this.key }
      )
    }

    await sink.tournament({
      externalId: String(tournament.id),
      slug: tournament.slug?.replace(/^tournament\//, '') ?? '',
      name: tournament.name,
      url: tournamentUrlFor(ref.url, tournament.slug),
      startAt: toDate(tournament.startAt),
      endAt: toDate(tournament.endAt),
      location:
        [tournament.city, tournament.addrState, tournament.countryCode]
          .filter(Boolean)
          .join(', ') || null,
      isOnline: tournament.isOnline ?? null,
    })

    const eventExternalId = String(node.id)
    const phases: any[] = node.phases ?? []
    const phaseGroups: any[] = node.phaseGroups ?? []

    /** Counted up front so progress reads as a fraction, not a rising number. */
    await sink.progress(0, phaseGroups.length)

    await sink.event({
      externalId: eventExternalId,
      name: node.name,
      game: node.videogame?.name ?? null,
      entryKind: entryKindFor(node.teamRosterSize),
      teamSize: node.teamRosterSize?.maxPlayers ?? null,
      entrantCount: node.numEntrants ?? null,
    })

    for await (const entrants of this.entrants(context, node.id)) {
      await sink.entrants(eventExternalId, entrants)
    }

    for (const phase of phases) {
      await sink.phase(eventExternalId, {
        externalId: String(phase.id),
        name: phase.name ?? null,
        order: phase.phaseOrder ?? null,
      })
    }

    let phaseGroupsDone = 0

    for (const group of phaseGroups) {
      const sets = await this.sets(context, group.id)

      await sink.bracket(eventExternalId, String(group.phase?.id), {
        externalId: String(group.id),
        name: group.displayIdentifier ?? null,
        bracketType: BRACKET_TYPES[group.bracketType] ?? 'other',
        sets,
      })

      phaseGroupsDone += 1
      await sink.progress(phaseGroupsDone, phaseGroups.length)
    }
  }

  /**
   * Names the events behind a tournament link so the admin can pick one.
   *
   * Costs one request, and only on a link that could not have been imported
   * anyway. The alternative is telling somebody their valid start.gg URL is
   * unrecognised.
   */
  private async rejectTournamentLink(context: PlatformContext, ref: EventRef): Promise<never> {
    const result = await this.query<any>(context, TOURNAMENT_EVENTS_QUERY, { slug: ref.slug })
    const tournament = result.tournament

    if (!tournament) {
      throw new PermanentPlatformError(`start.gg has no tournament at "${ref.slug}"`, {
        platform: this.key,
      })
    }

    const events: any[] = tournament.events ?? []

    if (events.length === 0) {
      throw new PermanentPlatformError(
        `${tournament.name} has no events on start.gg, so there is nothing to import.`,
        { platform: this.key }
      )
    }

    const names = events.map((event: any) => event.name).join(', ')

    throw new PermanentPlatformError(
      `That link is for a whole tournament. Imports cover one event, so open the ` +
        `event you want on start.gg and paste its link instead. ${tournament.name} has ` +
        `${events.length} event${events.length === 1 ? '' : 's'}: ${names}.`,
      { platform: this.key }
    )
  }

  private async *entrants(context: PlatformContext, eventId: string) {
    let page = 1
    let totalPages = 1

    do {
      const result = await this.query<any>(context, EVENT_ENTRANTS_QUERY, {
        eventId,
        page,
        perPage: ENTRANTS_PER_PAGE,
      })

      const connection = result.event?.entrants
      totalPages = connection?.pageInfo?.totalPages ?? 1

      const entrants: CanonicalEntrant[] = (connection?.nodes ?? []).map((entrant: any) => ({
        externalId: String(entrant.id),
        name: entrant.name,
        seed: entrant.seeds?.[0]?.seedNum ?? null,
        placement: entrant.standing?.placement ?? null,
        isDisqualified: entrant.isDisqualified ?? false,
        participants: (entrant.participants ?? []).map((participant: any) => ({
          /**
           * `user.id` is the stable cross-tournament account. `participant.id`
           * is per-event, so using it would make every tournament look like a
           * different person.
           */
          externalUserId: participant.user?.id ? String(participant.user.id) : null,
          gamerTag: participant.gamerTag,
          prefix: participant.prefix || null,
          pronouns: participant.user?.genderPronoun || null,
          country: participant.user?.location?.country || null,
          state: participant.user?.location?.state || null,
          city: participant.user?.location?.city || null,
        })),
      }))

      if (entrants.length > 0) {
        yield entrants
      }

      page += 1
    } while (page <= totalPages)
  }

  /**
   * Complexity is charged on the objects actually returned, so no fixed page
   * size is safe — a bracket recorded with full game and character data costs
   * several times one without. On rejection the page size halves and the bracket
   * restarts, which re-fetches the pages already read but is rare and bounded.
   *
   * Restarting is only safe because this returns an array. The entrants pager
   * yields as it goes, so it cannot rewind, and relies on its static page size.
   */
  private async sets(context: PlatformContext, phaseGroupId: string): Promise<CanonicalSet[]> {
    let perPage = SETS_PER_PAGE

    for (;;) {
      try {
        return await this.setsPage(context, phaseGroupId, perPage)
      } catch (error) {
        if (!isTooComplex(error) || perPage <= MIN_PER_PAGE) throw error

        perPage = Math.max(MIN_PER_PAGE, Math.floor(perPage / 2))
        context.logger.warn(
          `start.gg refused a sets page as too complex; retrying bracket ${phaseGroupId} at ${perPage} per page`
        )
      }
    }
  }

  private async setsPage(
    context: PlatformContext,
    phaseGroupId: string,
    perPage: number
  ): Promise<CanonicalSet[]> {
    const collected: CanonicalSet[] = []
    let page = 1
    let totalPages = 1

    do {
      const result = await this.query<any>(context, PHASE_GROUP_SETS_QUERY, {
        phaseGroupId,
        page,
        perPage,
      })

      const connection = result.phaseGroup?.sets
      totalPages = connection?.pageInfo?.totalPages ?? 1

      for (const set of connection?.nodes ?? []) {
        const slots: any[] = set.slots ?? []
        const entrantA = slots[0]?.entrant?.id
        const entrantB = slots[1]?.entrant?.id

        const outcomeA = outcomeFrom(slots[0])
        const outcomeB = outcomeFrom(slots[1])

        /**
         * start.gg exposes no ordinal field on Set, but the query asks for
         * `sortType: CALL_ORDER`, so position in the response is the suggested
         * play order within this bracket. That ordering keeps replay deterministic for sets with no completion timestamp.
         */
        const ordinal = collected.length + 1

        collected.push({
          externalId: String(set.id),
          state: SET_STATES[set.state] ?? 'pending',
          round: set.round ?? null,
          identifier: set.identifier ?? null,
          fullRoundText: set.fullRoundText ?? null,
          ordinal,
          entrantAExternalId: entrantA ? String(entrantA) : null,
          entrantBExternalId: entrantB ? String(entrantB) : null,
          winnerEntrantExternalId: set.winnerId ? String(set.winnerId) : null,
          scoreA: outcomeA.score,
          scoreB: outcomeB.score,
          entrantADisqualified: outcomeA.disqualified,
          entrantBDisqualified: outcomeB.disqualified,
          completedAt: toDate(set.completedAt),
          games: (set.games ?? []).map((game: any) => ({
            number: game.orderNum,
            winnerEntrantExternalId: game.winnerId ? String(game.winnerId) : null,
            stage: game.stage?.name ?? null,
            selections: (game.selections ?? [])
              .filter((selection: any) => selection.entrant?.id && selection.character?.name)
              .map((selection: any) => ({
                entrantExternalId: String(selection.entrant.id),
                participantExternalUserId: null,
                character: selection.character.name,
              })),
          })),
        })
      }

      page += 1
    } while (page <= totalPages)

    return collected
  }

  /**
   * GraphQL errors arrive with HTTP 200, so they have to be classified here
   * rather than by the shared HTTP layer.
   */
  private async query<T>(
    context: PlatformContext,
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    const response = await context.http(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.credentials.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    })

    const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> }

    if (body.errors?.length) {
      const message = body.errors[0].message

      /**
       * start.gg reports a transiently unavailable bracket as a query error.
       * Treating it as permanent would abandon an import that would succeed on
       * a retry moments later.
       */
      if (/unknown error|not found for id: preview/i.test(message)) {
        throw new TransientPlatformError(`start.gg could not answer the query: ${message}`, {
          platform: this.key,
        })
      }

      throw new PermanentPlatformError(`start.gg rejected the query: ${message}`, {
        platform: this.key,
      })
    }

    if (!body.data) {
      throw new TransientPlatformError('start.gg returned an empty response', {
        platform: this.key,
      })
    }

    return body.data
  }
}

/**
 * start.gg reports an over-budget request as a query error, not an HTTP status,
 * and it is permanent for that exact request — the same query will always cost
 * the same. Only a smaller page makes it succeed.
 */
function isTooComplex(error: unknown): boolean {
  return (
    error instanceof PermanentPlatformError && /query complexity is too high/i.test(error.message)
  )
}

/**
 * start.gg reports the disqualified side of a set with a score of `-1`, and no
 * score at all for the side that advanced. It is never a real score, so it is
 * read as a flag and dropped rather than stored.
 */
const DQ_SCORE = -1

function outcomeFrom(slot: any): { score: number | null; disqualified: boolean } {
  const value = slot?.standing?.stats?.score?.value

  if (value === DQ_SCORE) return { score: null, disqualified: true }
  return { score: typeof value === 'number' ? value : null, disqualified: false }
}

function toDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null
}

/**
 * start.gg models singles as a null roster size, so anything with a roster is a
 * team event.
 */
function entryKindFor(
  teamRosterSize: { minPlayers?: number; maxPlayers?: number } | null
): EntryKind {
  if (!teamRosterSize) return 'singles'
  if (teamRosterSize.maxPlayers === 2) return 'doubles'
  return 'crew'
}

/**
 * The tournament's own page, derived from the event link the admin pasted so a
 * stored tournament still points somewhere useful.
 */
function tournamentUrlFor(eventUrl: string | null, tournamentSlug: string | null): string | null {
  if (!tournamentSlug) return eventUrl
  const slug = tournamentSlug.replace(/^tournament\//, '')
  return `https://www.start.gg/tournament/${slug}`
}
