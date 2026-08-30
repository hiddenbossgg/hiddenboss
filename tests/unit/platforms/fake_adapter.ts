import vine from '@vinejs/vine'
import logger from '@adonisjs/core/services/logger'
import type {
  CredentialsSpec,
  ImportSink,
  PlatformAccountRef,
  PlatformAdapter,
  PlatformContext,
  EventRef,
} from '#lib/platforms/contracts'
import type {
  CanonicalBracket,
  CanonicalEntrant,
  CanonicalTournament,
} from '#lib/platforms/canonical'
import type { RecordingSink } from '#lib/platforms/recording_sink'
import { runAdapter as run } from './run_adapter.js'

/**
 * A minimal in-memory adapter used to exercise the platform contract.
 *
 * It exists so the contract is validated by an implementation that shares no
 * code with any real platform, and so the contract checks themselves have
 * something known-good to test against.
 */
export class FakePlatformAdapter implements PlatformAdapter {
  readonly key: string = 'fake'
  readonly displayName = 'Fake Platform'
  readonly rateLimit = { requests: 10, perSeconds: 60 }

  readonly credentials: CredentialsSpec | null = {
    schema: vine.object({ apiKey: vine.string().minLength(1) }),
    fields: [{ name: 'apiKey', label: 'API key', secret: true }],
  }

  matchUrl(url: string): EventRef | null {
    const match = /^https:\/\/fake\.test\/t\/([\w-]+)$/.exec(url)
    if (!match) return null

    return { platform: this.key, slug: match[1], url }
  }

  profileUrl(account: PlatformAccountRef): string | null {
    return account.profileSlug ? `https://fake.test/u/${account.profileSlug}` : null
  }

  async fetchEvent(ref: EventRef, _context: PlatformContext, sink: ImportSink): Promise<void> {
    await sink.tournament(this.tournament(ref))

    await sink.event({
      externalId: 'e1',
      name: 'Singles',
      game: 'rivals-2',
      entryKind: 'singles',
      teamSize: 1,
      entrantCount: 2,
    })

    await sink.entrants('e1', this.entrants())

    await sink.phase('e1', { externalId: 'p1', name: 'Bracket', order: 1 })

    await sink.bracket('e1', 'p1', this.bracket())

    await sink.progress(1, 1)
  }

  /** Overridable so tests can build a deliberately broken adapter. */
  protected tournament(ref: EventRef): CanonicalTournament {
    return {
      externalId: 't1',
      slug: ref.slug,
      name: 'Fake Major',
      url: ref.url,
      startAt: new Date('2026-03-01T00:00:00Z'),
      endAt: new Date('2026-03-02T00:00:00Z'),
      country: 'US',
      state: 'TX',
      city: 'Austin',
      address: null,
      isOnline: false,
    }
  }

  /** Overridable so tests can build a deliberately broken adapter. */
  protected entrants(): CanonicalEntrant[] {
    return [
      {
        externalId: 'en1',
        name: 'Alice',
        seed: 1,
        placement: 1,
        isDisqualified: false,
        participants: [
          {
            externalUserId: 'u1',
            profileSlug: 'alice',
            gamerTag: 'Alice',
            prefix: null,
            pronouns: 'she/her',
            country: 'US',
            state: 'CA',
            city: 'Los Angeles',
          },
        ],
      },
      {
        externalId: 'en2',
        name: 'Bob',
        seed: 2,
        placement: 2,
        isDisqualified: false,
        participants: [
          {
            externalUserId: 'u2',
            profileSlug: null,
            gamerTag: 'Bob',
            prefix: 'TSM',
            pronouns: null,
            country: null,
            state: null,
            city: null,
          },
        ],
      },
    ]
  }

  protected bracket(): CanonicalBracket {
    return {
      externalId: 'bracket1',
      name: 'Bracket',
      bracketType: 'double_elimination',
      sets: [
        {
          externalId: 's1',
          state: 'completed',
          round: 1,
          identifier: 'A',
          fullRoundText: 'Grand Final',
          ordinal: 1,
          entrantAExternalId: 'en1',
          entrantBExternalId: 'en2',
          winnerEntrantExternalId: 'en1',
          scoreA: 3,
          scoreB: 1,
          entrantADisqualified: false,
          entrantBDisqualified: false,
          completedAt: new Date('2026-03-02T18:00:00Z'),
          games: [
            {
              number: 1,
              winnerEntrantExternalId: 'en1',
              stage: 'Godscage',
              selections: [
                {
                  entrantExternalId: 'en1',
                  participantExternalUserId: 'u1',
                  character: 'zetterburn',
                },
                {
                  entrantExternalId: 'en2',
                  participantExternalUserId: 'u2',
                  character: 'orcane',
                },
              ],
            },
          ],
        },
      ],
    }
  }
}

export function fakeFixture(adapter: FakePlatformAdapter) {
  return {
    urls: ['https://fake.test/t/fake-major'],
    foreignUrls: ['https://www.start.gg/tournament/genesis-9', 'not a url at all'],
    run: () => ({
      ref: adapter.matchUrl('https://fake.test/t/fake-major')!,
      context: {
        credentials: { apiKey: 'test' },
        http: () => Promise.reject(new Error('the fake adapter performs no HTTP')),
        signal: new AbortController().signal,
        logger,
      } satisfies PlatformContext,
    }),
  }
}

/** Runs the fake through the validating sink, as the pipeline would. */
export function runAdapter(adapter: FakePlatformAdapter): Promise<RecordingSink> {
  const { ref, context } = fakeFixture(adapter).run()
  return run(adapter, ref, context)
}
