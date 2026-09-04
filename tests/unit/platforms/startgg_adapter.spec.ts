import { test } from '@japa/runner'
import vine from '@vinejs/vine'
import logger from '@adonisjs/core/services/logger'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StartggAdapter } from '#lib/platforms/startgg/adapter'
import { runAdapter, runTwice } from './run_adapter.js'
import { fixtureContext, hasFixtures } from './fixture_http.js'
import type { PlatformContext } from '#lib/platforms/contracts'

const FIXTURE_ROOT = fileURLToPath(new URL('../../fixtures/platforms/', import.meta.url))

/**
 * Fixture-backed tests are skipped until somebody records real responses:
 *
 *   node ace record:platform-fixtures startgg <url> --credentials='{"token":"..."}'
 *
 * Recording needs a start.gg personal access token. Replaying does not, which
 * is the point — the suite stays runnable by contributors without a key.
 */
const recorded = await hasFixtures('startgg')
const manifest: { events: Array<{ url: string; slug: string }> } = recorded
  ? JSON.parse(await readFile(join(FIXTURE_ROOT, 'startgg', 'manifest.json'), 'utf8'))
  : { events: [] }

/**
 * Two events of one tournament are recorded. Singles is the ordinary case;
 * doubles is where an entrant is two people, which an entrant-is-one-player
 * model would quietly lose half of.
 */
const eventUrl = (kind: 'singles' | 'doubles') =>
  manifest.events.find((event) => event.url.endsWith(kind))!.url

test.group('startgg adapter', () => {
  /**
   * An import covers one event, so the event segment is the identifier. start.gg
   * addresses an event by its full path, which is what the slug carries.
   */
  test('recognises event URLs', ({ assert }) => {
    const adapter = new StartggAdapter()

    assert.deepInclude(
      adapter.matchUrl('https://www.start.gg/tournament/genesis-9/event/melee-singles')!,
      { platform: 'startgg', slug: 'tournament/genesis-9/event/melee-singles' }
    )

    // Deep links carry more path after the event; only the event segment counts.
    assert.deepInclude(
      adapter.matchUrl(
        'https://www.start.gg/tournament/genesis-9/event/melee-singles/brackets/1/2'
      )!,
      { slug: 'tournament/genesis-9/event/melee-singles' }
    )

    // smash.gg links are still in the wild years later.
    assert.deepInclude(
      adapter.matchUrl('https://smash.gg/tournament/genesis-9/event/melee-singles')!,
      { slug: 'tournament/genesis-9/event/melee-singles' }
    )
  })

  /**
   * A tournament link is ours, so it must not report as unrecognised. It
   * resolves to the tournament slug and `fetchEvent` rejects it with the event
   * names to choose from.
   */
  test('recognises a tournament URL but does not treat it as an event', ({ assert }) => {
    const adapter = new StartggAdapter()

    assert.deepInclude(adapter.matchUrl('https://www.start.gg/tournament/genesis-9')!, {
      slug: 'genesis-9',
    })

    // The events listing page is not one event either.
    assert.deepInclude(adapter.matchUrl('https://www.start.gg/tournament/genesis-9/events')!, {
      slug: 'genesis-9',
    })
  })

  test('rejects URLs belonging to other platforms', ({ assert }) => {
    const adapter = new StartggAdapter()

    assert.isNull(adapter.matchUrl('https://challonge.com/abc123'))
    assert.isNull(adapter.matchUrl('https://www.start.gg/user/abcd'))
    assert.isNull(adapter.matchUrl('not a url'))
  })

  test('builds a profile URL from the stored discriminator', ({ assert }) => {
    const adapter = new StartggAdapter()

    // `profileSlug` is the bare discriminator; the `user/` segment is added here.
    assert.equal(
      adapter.profileUrl({
        externalUserId: '1402401',
        profileSlug: '8958b6cd',
        gamerTag: 'Jello',
      }),
      'https://www.start.gg/user/8958b6cd'
    )

    // An account imported before the discriminator was captured has nothing to link to.
    assert.isNull(
      adapter.profileUrl({ externalUserId: '1402401', profileSlug: null, gamerTag: 'Jello' })
    )
  })

  test('declares the credentials it needs', ({ assert }) => {
    const adapter = new StartggAdapter()

    assert.isNotNull(adapter.credentials)
    assert.deepEqual(
      adapter.credentials!.fields.map((field) => field.name),
      ['token']
    )
    assert.isTrue(adapter.credentials!.fields[0].secret)
  })

  test('stays under the documented rate limit', ({ assert }) => {
    const adapter = new StartggAdapter()

    // start.gg documents roughly 80 requests per 60s per token.
    assert.isBelow(adapter.rateLimit.requests / adapter.rateLimit.perSeconds, 80 / 60)
  })

  test('satisfies the import contract against recorded responses', async ({ assert }) => {
    const sink = await recordedSink()

    assert.isAbove(sink.calls.length, 0)
    assert.lengthOf(sink.tournaments, 1)
    assert.lengthOf(sink.events, 1, 'an import covers exactly one event')
    assert.isAbove(sink.brackets.length, 0)
  }).skip(!recorded, 'no start.gg fixtures recorded yet')

  test('rejects an empty credential payload', async ({ assert }) => {
    const adapter = new StartggAdapter()
    const validator = vine.compile(adapter.credentials.schema)

    await assert.rejects(() => validator.validate({}))
  })

  test('converts the same responses identically every time', async ({ assert }) => {
    const adapter = new StartggAdapter()
    const context = await fixtureContext('startgg')

    const [first, second] = await runTwice(adapter, () => ({
      ref: adapter.matchUrl(eventUrl('singles'))!,
      context,
    }))

    assert.deepEqual(
      JSON.parse(JSON.stringify(second.calls)),
      JSON.parse(JSON.stringify(first.calls))
    )
  }).skip(!recorded, 'no start.gg fixtures recorded yet')

  test('converts recorded responses into canonical records', async ({ assert }) => {
    const sink = await recordedSink()

    assert.equal(sink.calls[0].name, 'tournament')
    assert.isAbove(sink.brackets.length, 0)
  }).skip(!recorded, 'no start.gg fixtures recorded yet')

  /**
   * `city`/`addrState`/`countryCode` are already fetched for `isOnline`, so
   * this is what proves they reach the tournament record rather than being
   * read and discarded. `address` is a separate gap: it needs `venueAddress`
   * added to the query, which would orphan every recorded fixture.
   */
  test('reads tournament location from the platform', async ({ assert }) => {
    const sink = await recordedSink()
    const [tournament] = sink.tournaments

    assert.isNotNull(tournament.country, 'expected a country from the fixture')
    assert.match(tournament.country!, /^[A-Z]{2}$/, 'country should be an ISO alpha-2 code')
    assert.isNotNull(tournament.state)
    assert.isNotNull(tournament.city)
    assert.isNull(tournament.address, 'venueAddress is not queried yet')
  }).skip(!recorded, 'no start.gg fixtures recorded yet')

  test('reads doubles entrants as multiple people', async ({ assert }) => {
    const sink = await recordedSink('doubles')

    const teams = sink.allEntrants.filter((entrant) => entrant.participants.length > 1)

    assert.isAbove(teams.length, 0)
    for (const team of teams) {
      assert.lengthOf(team.participants, 2)
      for (const participant of team.participants) {
        assert.isNotNull(participant.externalUserId)
      }
    }
  }).skip(!recorded, 'no start.gg fixtures recorded yet')

  /**
   * Several people entered both events. Since each event is its own import, the
   * account id is the only thing tying them together — and it must, because that
   * is what lets identity resolution recognise them without any tag matching.
   */
  test('gives a person the same account id in separate event imports', async ({ assert }) => {
    const singles = await recordedSink('singles')
    const doubles = await recordedSink('doubles')

    const byTag = new Map<string, Set<string>>()
    for (const sink of [singles, doubles]) {
      for (const entrant of sink.allEntrants) {
        for (const participant of entrant.participants) {
          const ids = byTag.get(participant.gamerTag) ?? new Set<string>()
          if (participant.externalUserId) ids.add(participant.externalUserId)
          byTag.set(participant.gamerTag, ids)
        }
      }
    }

    const identified = [...byTag.entries()].filter(([, ids]) => ids.size > 0)
    assert.isAbove(identified.length, 0)

    for (const [tag, ids] of identified) {
      assert.lengthOf(ids, 1, `${tag} resolved to more than one account`)
    }
  }).skip(!recorded, 'no start.gg fixtures recorded yet')

  /**
   * The recorded singles bracket contains four walkovers, which is why it is
   * useful here: start.gg marks the absent side with a score of -1, and that
   * must never reach storage as a score.
   */
  test('reads a disqualified side as a flag, not a score of -1', async ({ assert }) => {
    const sink = await recordedSink('singles')
    const sets = sink.brackets.flatMap((call) => call.bracket.sets)

    const walkovers = sets.filter((set) => set.entrantADisqualified || set.entrantBDisqualified)
    assert.isAbove(walkovers.length, 0)

    for (const set of sets) {
      assert.notEqual(set.scoreA, -1, `set ${set.externalId} kept start.gg's DQ marker as a score`)
      assert.notEqual(set.scoreB, -1, `set ${set.externalId} kept start.gg's DQ marker as a score`)
    }

    // Only the absent side is flagged, and the other one advanced.
    for (const set of walkovers) {
      assert.isFalse(
        set.entrantADisqualified && set.entrantBDisqualified,
        'no double DQs in this bracket'
      )
      assert.isNotNull(set.winnerEntrantExternalId)

      const loser = set.entrantADisqualified ? set.entrantAExternalId : set.entrantBExternalId
      assert.notEqual(set.winnerEntrantExternalId, loser)
    }
  }).skip(!recorded, 'no start.gg fixtures recorded yet')

  /**
   * The same invariant the parry.gg adapter needed: asserting only that a winner
   * exists is satisfied just as well by naming the loser.
   */
  test('names the higher-scoring side as the winner', async ({ assert }) => {
    const sink = await recordedSink()
    const sets = sink.brackets.flatMap((call) => call.bracket.sets)

    const scored = sets.filter(
      (set) =>
        set.state === 'completed' &&
        set.scoreA !== null &&
        set.scoreB !== null &&
        set.scoreA !== set.scoreB
    )
    assert.isAbove(scored.length, 0)

    for (const set of scored) {
      const expected = set.scoreA! > set.scoreB! ? set.entrantAExternalId : set.entrantBExternalId

      assert.equal(
        set.winnerEntrantExternalId,
        expected,
        `set ${set.externalId} scored ${set.scoreA}-${set.scoreB} but named the other side`
      )
    }
  }).skip(!recorded, 'no start.gg fixtures recorded yet')

  test('keeps sponsor prefixes off the gamertag', async ({ assert }) => {
    const sink = await recordedSink()

    const prefixed = sink.allEntrants
      .flatMap((entrant) => entrant.participants)
      .filter((participant) => participant.prefix !== null)

    assert.isAbove(prefixed.length, 0)
    for (const participant of prefixed) {
      assert.notInclude(participant.gamerTag, '|')
    }
  }).skip(!recorded, 'no start.gg fixtures recorded yet')
})

/**
 * start.gg charges query complexity against the objects actually returned, so a
 * page size that works for one bracket fails on a denser one. A real 32-set
 * bracket was rejected at 100 per page with "actual: 1153".
 *
 * Reaches into `sets` directly: driving this through `fetchEvent` would
 * mean stubbing the tournament and structure queries too, which would test the
 * stub more than the retry.
 */
test.group('startgg query complexity', () => {
  function contextRejectingAbove(limit: number) {
    const attempts: number[] = []

    const http = async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { variables: { perPage: number } }
      const perPage = body.variables.perPage
      attempts.push(perPage)

      if (perPage > limit) {
        return new Response(
          JSON.stringify({
            errors: [
              {
                message:
                  'Your query complexity is too high. A maximum of 1000 objects may be returned by each request. (actual: 1153)',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          data: {
            phaseGroup: {
              id: 'pg1',
              sets: {
                pageInfo: { totalPages: 1 },
                nodes: [
                  {
                    id: 's1',
                    identifier: 'A',
                    round: 1,
                    fullRoundText: 'Winners Final',
                    state: 3,
                    completedAt: 1750000000,
                    winnerId: 'en1',
                    slots: [{ entrant: { id: 'en1' } }, { entrant: { id: 'en2' } }],
                    games: [],
                  },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }

    return {
      attempts,
      context: {
        credentials: { token: 'test-token' },
        http,
        signal: new AbortController().signal,
        logger,
      } satisfies PlatformContext,
    }
  }

  test('halves the page size until start.gg accepts the request', async ({ assert }) => {
    const adapter = new StartggAdapter()
    const { attempts, context } = contextRejectingAbove(10)

    const sets = await adapter['sets'](context, 'pg1')

    assert.lengthOf(sets, 1)
    assert.equal(sets[0].externalId, 's1')

    // Started at 20, halved to 10, which was accepted.
    assert.deepEqual(attempts, [20, 10])
  })

  test('gives up rather than looping forever when even the smallest page is refused', async ({
    assert,
  }) => {
    const adapter = new StartggAdapter()
    const { attempts, context } = contextRejectingAbove(0)

    await assert.rejects(() => adapter['sets'](context, 'pg1'), /query complexity is too high/)

    // 20 -> 10 -> 5 -> 4, then stops at the floor instead of retrying forever.
    assert.deepEqual(attempts, [20, 10, 5, 4])
  })
})

async function recordedSink(kind: 'singles' | 'doubles' = 'singles') {
  const adapter = new StartggAdapter()
  const context = await fixtureContext('startgg')

  return runAdapter(adapter, adapter.matchUrl(eventUrl(kind))!, context)
}
