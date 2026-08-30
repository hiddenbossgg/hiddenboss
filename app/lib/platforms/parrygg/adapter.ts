import vine from '@vinejs/vine'
import { bool, int, methodUrl, timestamp } from './api.js'
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
  EventRef,
  ImportSink,
  PlatformAccountRef,
  PlatformAdapter,
  PlatformContext,
} from '#lib/platforms/contracts'

const BRACKET_TYPES: Record<string, BracketType> = {
  BRACKET_TYPE_SINGLE_ELIMINATION: 'single_elimination',
  BRACKET_TYPE_DOUBLE_ELIMINATION: 'double_elimination',
  BRACKET_TYPE_ROUND_ROBIN: 'round_robin',
}

const SET_STATES: Record<string, SetState> = {
  MATCH_STATE_PENDING: 'pending',
  MATCH_STATE_READY: 'pending',
  MATCH_STATE_IN_PROGRESS: 'started',
  MATCH_STATE_COMPLETED: 'completed',
}

export class ParryggAdapter implements PlatformAdapter {
  readonly key = 'parrygg'
  readonly displayName = 'parry.gg'

  /**
   * parry.gg publishes no rate limit, so this is deliberately conservative —
   * being slightly slow costs a longer import, being slightly fast costs a
   * league its API key.
   */
  readonly rateLimit = { requests: 60, perSeconds: 60 }

  readonly credentials: CredentialsSpec = {
    schema: vine.object({ apiKey: vine.string().trim().minLength(10) }),
    fields: [
      {
        name: 'apiKey',
        label: 'API key',
        help: 'Create one in parry.gg under account settings.',
        secret: true,
      },
    ],
  }

  /**
   * Recognises `parry.gg/<tournament>/<event>`.
   *
   * A tournament slug on its own resolves too, so `fetchEvent` can answer with
   * the events available rather than the link reading as unsupported. Tournament
   * slugs come in three flavours — primary, outdated and custom — and all of them
   * address the same tournament, so whatever the admin pasted is passed through
   * untouched.
   */
  matchUrl(url: string): EventRef | null {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return null
    }

    if (!['parry.gg', 'www.parry.gg'].includes(parsed.hostname)) {
      return null
    }

    const segments = parsed.pathname.split('/').filter(Boolean)
    const [tournament, event] = segments

    if (!tournament) return null

    return {
      platform: this.key,
      slug: event ? `${tournament}/${event}` : tournament,
      url,
    }
  }

  /**
   * parry.gg looks a public profile up by the same user id it deduplicates
   * accounts on, which is what `profileSlug` carries.
   */
  profileUrl(account: PlatformAccountRef): string | null {
    return account.profileSlug ? `https://parry.gg/profile/${account.profileSlug}` : null
  }

  async fetchEvent(ref: EventRef, context: PlatformContext, sink: ImportSink): Promise<void> {
    const [tournamentSlug, eventSlug] = ref.slug.split('/')

    const { tournament } = await this.call<any>(context, 'TournamentService', 'GetTournament', {
      tournamentSlug,
    })

    if (!tournament) {
      throw new PermanentPlatformError(`parry.gg has no tournament at "${tournamentSlug}"`, {
        platform: this.key,
      })
    }

    const events: any[] = tournament.events ?? []

    if (!eventSlug) {
      this.rejectTournamentLink(tournament, events)
    }

    const event = events.find((candidate) => candidate.slug === eventSlug)

    if (!event) {
      throw new PermanentPlatformError(
        `${tournament.name} has no event "${eventSlug}". It has: ${
          events.map((candidate) => candidate.slug).join(', ') || 'none'
        }.`,
        { platform: this.key }
      )
    }

    await sink.tournament({
      externalId: String(tournament.id),
      slug: primarySlug(tournament) ?? tournamentSlug,
      name: tournament.name,
      url: ref.url,
      startAt: timestamp(tournament.startDate),
      endAt: timestamp(tournament.endDate),
      country: tournament.address?.countryCode || null,
      state: tournament.address?.administrativeAreaLevel1 || null,
      city: tournament.address?.locality || null,
      address: tournament.address?.formattedAddress || tournament.venueAddress || null,
      isOnline: tournament.locationType === 'LOCATION_TYPE_ONLINE',
    })

    const phases: any[] = event.phases ?? []
    const bracketRefs = phases.flatMap((phase: any) =>
      (phase.brackets ?? []).map((bracket: any) => ({ phase, bracketId: bracket.id }))
    )

    await sink.progress(0, bracketRefs.length)

    const eventExternalId = String(event.id)
    const entrantSize = int(event.entrantSize)

    await sink.event({
      externalId: eventExternalId,
      name: event.name,
      game: event.game?.name ?? null,
      entryKind: entryKindFor(entrantSize),
      teamSize: entrantSize > 0 ? entrantSize : null,
      entrantCount: int(event.entrantCount) || null,
    })

    /**
     * Brackets carry the entrants, as seeds, so they are all read before
     * anything is sent: the contract wants an event's entrants before its
     * brackets, and one bracket's seeds are only part of the field.
     */
    const brackets = await Promise.all(
      bracketRefs.map(async ({ phase, bracketId }) => ({
        phase,
        bracket: await this.bracket(context, bracketId),
      }))
    )

    await sink.entrants(eventExternalId, this.entrantsIn(brackets.map((row) => row.bracket)))

    for (const phase of phases) {
      await sink.phase(eventExternalId, {
        externalId: String(phase.id),
        name: phase.name ?? null,
        order: null,
      })
    }

    let done = 0

    for (const { phase, bracket } of brackets) {
      await sink.bracket(eventExternalId, String(phase.id), {
        externalId: String(bracket.id),
        name: bracket.name ?? null,
        bracketType: BRACKET_TYPES[bracket.type] ?? 'other',
        sets: this.setsIn(bracket),
      })

      done += 1
      await sink.progress(done, bracketRefs.length)
    }
  }

  /**
   * Names the events behind a tournament link so an admin can pick one, rather
   * than reporting a valid parry.gg URL as unimportable.
   */
  private rejectTournamentLink(tournament: any, events: any[]): never {
    if (events.length === 0) {
      throw new PermanentPlatformError(
        `${tournament.name} has no events on parry.gg, so there is nothing to import.`,
        { platform: this.key }
      )
    }

    throw new PermanentPlatformError(
      `That link is for a whole tournament. Imports cover one event, so open the ` +
        `event you want on parry.gg and paste its link instead. ${tournament.name} has ` +
        `${events.length} event${events.length === 1 ? '' : 's'}: ` +
        `${events.map((event: any) => event.name).join(', ')}.`,
      { platform: this.key }
    )
  }

  private async bracket(context: PlatformContext, bracketId: string): Promise<any> {
    const { bracket } = await this.call<any>(context, 'BracketService', 'GetBracket', {
      id: bracketId,
    })

    if (!bracket) {
      throw new TransientPlatformError(`parry.gg returned no bracket for ${bracketId}`, {
        platform: this.key,
      })
    }

    return bracket
  }

  /**
   * One entrant per seed, deduplicated across brackets — a seed that progresses
   * from pools into a final bracket appears in both.
   */
  private entrantsIn(brackets: any[]): CanonicalEntrant[] {
    const byId = new Map<string, CanonicalEntrant>()

    for (const bracket of brackets) {
      for (const seed of [...(bracket.seeds ?? []), ...(bracket.progressedSeeds ?? [])]) {
        const eventEntrant = seed.eventEntrant
        const entrant = eventEntrant?.entrant
        if (!entrant?.id) continue

        const externalId = String(entrant.id)
        if (byId.has(externalId)) continue

        byId.set(externalId, {
          externalId,
          name: eventEntrant.name || teamName(entrant.users ?? []),
          seed: int(seed.seed) || null,
          /**
           * parry.gg does publish final standings, but only through
           * `EventService/GetEventPlacements` — a call this import does not make,
           * so nothing here knows them. Left null rather than guessed from the
           * bracket.
           */
          placement: null,
          isDisqualified: false,
          participants: (entrant.users ?? []).map((user: any) => ({
            externalUserId: user.id ? String(user.id) : null,
            /** parry.gg keys public profiles by the same id it accounts on. */
            profileSlug: user.id ? String(user.id) : null,
            gamerTag: user.gamerTag,
            prefix: null,
            pronouns: user.pronouns || null,
            country: user.locationCountry || null,
            state: user.locationState || null,
            city: user.locationCity || null,
          })),
        })
      }
    }

    return [...byId.values()]
  }

  private setsIn(bracket: any): CanonicalSet[] {
    /** `rounds` carries parry.gg's own labels, which beat anything synthesised. */
    const labels = new Map<string, string>()
    for (const round of bracket.rounds ?? []) {
      labels.set(`${int(round.number)}:${bool(round.winnersSide)}`, round.label)
    }

    const seedToEntrant = new Map<string, string>()
    for (const seed of [...(bracket.seeds ?? []), ...(bracket.progressedSeeds ?? [])]) {
      const entrantId = seed.eventEntrant?.entrant?.id
      if (seed.id && entrantId) seedToEntrant.set(String(seed.id), String(entrantId))
    }

    return (bracket.matches ?? []).map((match: any, index: number) => {
      const slots: any[] = match.slots ?? []
      const slotA = slots.find((slot) => int(slot.slot) === 0)
      const slotB = slots.find((slot) => int(slot.slot) === 1)

      const entrantA = slotA ? (seedToEntrant.get(String(slotA.seedId)) ?? null) : null
      const entrantB = slotB ? (seedToEntrant.get(String(slotB.seedId)) ?? null) : null

      const state = SET_STATES[match.state] ?? 'pending'
      const decided = state === 'completed'

      /**
       * parry.gg places within a match from zero — the winner is 0 and the loser
       * is 1 — despite the proto commenting it as "1st, 2nd". proto3 omits zero,
       * so the winner carries no `placement` field at all, which makes looking
       * for the winner directly indistinguishable from an undecided match where
       * neither side has one. The loser is the side actually marked, so that is
       * what is read, and the winner is whoever else played.
       */
      const loserSlot = decided ? slots.find((slot) => int(slot.placement) === 1) : undefined
      const winnerSlot = loserSlot === slotA ? slotB : loserSlot === slotB ? slotA : undefined
      const winner = winnerSlot ? (seedToEntrant.get(String(winnerSlot.seedId)) ?? null) : null

      return {
        externalId: String(match.id),
        state,
        round: bool(match.winnersSide) ? int(match.round) : -int(match.round),
        identifier: match.identifier || null,
        fullRoundText: labels.get(`${int(match.round)}:${bool(match.winnersSide)}`) ?? null,
        ordinal: index + 1,
        entrantAExternalId: entrantA,
        entrantBExternalId: entrantB,
        winnerEntrantExternalId: winner,
        scoreA: decided && slotA ? int(slotA.score) : null,
        scoreB: decided && slotB ? int(slotB.score) : null,
        /** parry.gg has no DQ marker of its own on a slot. */
        entrantADisqualified: false,
        entrantBDisqualified: false,
        completedAt: timestamp(match.endedAt) ?? timestamp(match.stateUpdatedAt),
        games: [],
      }
    })
  }

  /**
   * Errors arrive as a non-200 with a JSON body, so they are classified here.
   * The shared HTTP layer already retries 5xx and honours `Retry-After`; this
   * only has to make an expired key readable rather than an opaque 401.
   */
  private async call<T>(
    context: PlatformContext,
    service: string,
    method: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const response = await context.http(methodUrl(service, method), {
      method: 'POST',
      headers: {
        'X-API-KEY': context.credentials.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const text = await response.text()

    if (!response.ok) {
      throw new PermanentPlatformError(
        `parry.gg rejected ${service}/${method}: ${message(text) ?? response.status}`,
        { platform: this.key }
      )
    }

    try {
      return JSON.parse(text) as T
    } catch {
      throw new TransientPlatformError(`parry.gg returned an unreadable response from ${method}`, {
        platform: this.key,
      })
    }
  }
}

function message(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string }
    return parsed.message ?? parsed.error ?? null
  } catch {
    return body.slice(0, 200) || null
  }
}

function primarySlug(tournament: any): string | null {
  const slugs: any[] = tournament.slugs ?? []
  const primary = slugs.find((slug) => slug.type === 'SLUG_TYPE_PRIMARY')
  return primary?.slug ?? slugs[0]?.slug ?? null
}

/** A team's name when parry.gg has not been given one. */
function teamName(users: any[]): string {
  return (
    users
      .map((user) => user.gamerTag)
      .filter(Boolean)
      .join(' / ') || 'TBD'
  )
}

function entryKindFor(entrantSize: number): EntryKind {
  if (entrantSize <= 1) return 'singles'
  if (entrantSize === 2) return 'doubles'
  return 'crew'
}
