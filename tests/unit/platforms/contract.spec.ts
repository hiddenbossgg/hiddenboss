import { test } from '@japa/runner'
import { CapabilityObserver } from '#lib/platforms/capabilities'
import { RecordingSink } from '#lib/platforms/recording_sink'
import { PlatformRegistry } from '#lib/platforms/registry'
import {
  PermanentPlatformError,
  TransientPlatformError,
  isRetryableHttpStatus,
  parseRetryAfter,
} from '#lib/platforms/errors'
import { FakePlatformAdapter, fakeFixture, runAdapter } from './fake_adapter.js'
import type { ImportSink, PlatformContext, EventRef } from '#lib/platforms/contracts'
import type { CanonicalBracket } from '#lib/platforms/canonical'

/**
 * Delegates every call except the ones named, so a test can build an adapter
 * that skips a step without restating the whole conversion.
 */
function sinkWithout(sink: ImportSink, ...drop: Array<keyof ImportSink>): ImportSink {
  const skip = new Set<keyof ImportSink>(drop)
  const noop = Promise.resolve()

  return {
    tournament: (t) => (skip.has('tournament') ? noop : sink.tournament(t)),
    event: (e) => (skip.has('event') ? noop : sink.event(e)),
    entrants: (id, entrants) => (skip.has('entrants') ? noop : sink.entrants(id, entrants)),
    phase: (id, phase) => (skip.has('phase') ? noop : sink.phase(id, phase)),
    bracket: (e, p, b) => (skip.has('bracket') ? noop : sink.bracket(e, p, b)),
    progress: (c, t, l) => (skip.has('progress') ? noop : sink.progress(c, t, l)),
  }
}

/**
 * `ValidatingSink` wraps every real import, so these are the checks that stop a
 * misbehaving adapter from writing rows that are quietly wrong. Each case is
 * driven through a whole adapter run, which is how an adapter's own unit tests
 * inherit them for free.
 */
test.group('import contract enforcement', () => {
  test('a well-formed adapter passes', async ({ assert }) => {
    const sink = await runAdapter(new FakePlatformAdapter())

    assert.equal(sink.calls[0].name, 'tournament')
    assert.lengthOf(sink.brackets, 1)
  })

  test('rejects a set referencing an unknown entrant', async ({ assert }) => {
    class Broken extends FakePlatformAdapter {
      protected override bracket(): CanonicalBracket {
        const bracket = super.bracket()
        bracket.sets[0].entrantBExternalId = 'ghost'
        bracket.sets[0].winnerEntrantExternalId = 'en1'
        bracket.sets[0].games = []
        return bracket
      }
    }

    await assert.rejects(() => runAdapter(new Broken()), /set s1 against unknown entrant ghost/)
  })

  test('rejects a winner who did not play in the set', async ({ assert }) => {
    class Broken extends FakePlatformAdapter {
      protected override bracket(): CanonicalBracket {
        const bracket = super.bracket()
        bracket.sets[0].winnerEntrantExternalId = 'en2'
        bracket.sets[0].entrantBExternalId = null
        bracket.sets[0].games = []
        return bracket
      }
    }

    await assert.rejects(() => runAdapter(new Broken()), /winner that did not play in it/)
  })

  test('rejects a bracket sent before its phase', async ({ assert }) => {
    class Broken extends FakePlatformAdapter {
      override fetchEvent(
        ref: EventRef,
        context: PlatformContext,
        sink: ImportSink
      ): Promise<void> {
        return super.fetchEvent(ref, context, sinkWithout(sink, 'phase'))
      }
    }

    await assert.rejects(() => runAdapter(new Broken()), /a bracket before its phase p1/)
  })

  test('rejects entrants sent after their event brackets', async ({ assert }) => {
    class Reordered extends FakePlatformAdapter {
      /** Emptied so the unknown-entrant check does not fire first. */
      protected override bracket(): CanonicalBracket {
        return { ...super.bracket(), sets: [] }
      }

      override async fetchEvent(
        ref: EventRef,
        context: PlatformContext,
        sink: ImportSink
      ): Promise<void> {
        await super.fetchEvent(ref, context, sinkWithout(sink, 'entrants'))
        await sink.entrants('e1', [])
      }
    }

    await assert.rejects(() => runAdapter(new Reordered()), /after that event's brackets/)
  })

  test('rejects a second tournament', async ({ assert }) => {
    class Broken extends FakePlatformAdapter {
      override async fetchEvent(
        ref: EventRef,
        context: PlatformContext,
        sink: ImportSink
      ): Promise<void> {
        await super.fetchEvent(ref, context, sink)
        await super.fetchEvent(ref, context, sink)
      }
    }

    await assert.rejects(() => runAdapter(new Broken()), /more than one tournament/)
  })

  test('rejects an adapter that keeps going after a sink error', async ({ assert }) => {
    class Swallowing extends FakePlatformAdapter {
      override async fetchEvent(
        ref: EventRef,
        context: PlatformContext,
        sink: ImportSink
      ): Promise<void> {
        await super.fetchEvent(ref, context, sink)

        try {
          await sink.phase('no-such-event', { externalId: 'px', name: null, order: null })
        } catch {
          // The bug this exists to catch: a violation or abort is discarded.
        }

        await sink.progress(1, 1)
      }
    }

    await assert.rejects(() => runAdapter(new Swallowing()), /after an earlier failure/)
  })

  test('violations are permanent, so the pipeline does not retry them', async ({ assert }) => {
    class Broken extends FakePlatformAdapter {
      protected override bracket(): CanonicalBracket {
        const bracket = super.bracket()
        bracket.sets[0].entrantBExternalId = 'ghost'
        bracket.sets[0].games = []
        bracket.sets[0].winnerEntrantExternalId = null
        return bracket
      }
    }

    try {
      await runAdapter(new Broken())
      assert.fail('expected a contract violation')
    } catch (error) {
      assert.instanceOf(error, PermanentPlatformError)
      assert.isFalse((error as PermanentPlatformError).retryable)
    }
  })

  test('rejects a disqualification on a side with no entrant', async ({ assert }) => {
    class Broken extends FakePlatformAdapter {
      protected override bracket(): CanonicalBracket {
        const bracket = super.bracket()
        bracket.sets[0].entrantBExternalId = null
        bracket.sets[0].entrantBDisqualified = true
        bracket.sets[0].winnerEntrantExternalId = 'en1'
        bracket.sets[0].games = []
        return bracket
      }
    }

    await assert.rejects(
      () => runAdapter(new Broken()),
      /disqualifying side B, which has no entrant/
    )
  })

  test('a completed set with no winner is allowed, since rating skips it', async ({ assert }) => {
    class Undecided extends FakePlatformAdapter {
      protected override bracket(): CanonicalBracket {
        const bracket = super.bracket()
        bracket.sets[0].winnerEntrantExternalId = null
        bracket.sets[0].games = []
        return bracket
      }
    }

    const sink = await runAdapter(new Undecided())
    assert.lengthOf(sink.brackets, 1)
  })

  test('the fake adapter recognises its own URLs and rejects foreign ones', ({ assert }) => {
    const adapter = new FakePlatformAdapter()
    const fixture = fakeFixture(adapter)

    for (const url of fixture.urls) {
      assert.equal(adapter.matchUrl(url)?.platform, 'fake')
    }
    for (const url of fixture.foreignUrls) {
      assert.isNull(adapter.matchUrl(url))
    }
  })
})

test.group('platform registry', () => {
  test('resolves a URL to its adapter', ({ assert }) => {
    const registry = new PlatformRegistry()
    registry.register(new FakePlatformAdapter())

    const resolved = registry.resolveUrl('https://fake.test/t/genesis')
    assert.equal(resolved?.adapter.key, 'fake')
    assert.equal(resolved?.ref.slug, 'genesis')
  })

  test('returns null for an unrecognised URL', ({ assert }) => {
    const registry = new PlatformRegistry()
    registry.register(new FakePlatformAdapter())

    assert.isNull(registry.resolveUrl('https://www.start.gg/tournament/genesis-9'))
  })

  test('refuses to guess when two adapters claim the same URL', ({ assert }) => {
    const registry = new PlatformRegistry()
    registry.register(new FakePlatformAdapter())

    class Greedy extends FakePlatformAdapter {
      override readonly key = 'greedy'
    }
    registry.register(new Greedy())

    assert.throws(() => registry.resolveUrl('https://fake.test/t/genesis'), /Ambiguous/)
  })

  test('refuses duplicate registration', ({ assert }) => {
    const registry = new PlatformRegistry()
    registry.register(new FakePlatformAdapter())

    assert.throws(() => registry.register(new FakePlatformAdapter()), /already registered/)
  })
})

test.group('observed capabilities', () => {
  test('derives capabilities from what actually arrived', async ({ assert }) => {
    const adapter = new FakePlatformAdapter()
    const observer = new CapabilityObserver()
    const fixture = fakeFixture(adapter)
    const { ref, context } = fixture.run()

    const sink = new RecordingSink()
    await adapter.fetchEvent(ref, context, sink)

    for (const call of sink.entrantBatches) observer.observeEntrants(call.entrants)
    for (const call of sink.brackets) observer.observeBracket(call.bracket)

    assert.deepEqual(observer.result, {
      participantIds: true,
      seeds: true,
      placements: true,
      games: true,
      characterSelections: true,
      stages: true,
    })
  })

  test('reports no participant ids when a platform has none', ({ assert }) => {
    const observer = new CapabilityObserver()

    observer.observeEntrants([
      {
        externalId: 'en1',
        name: 'Alice',
        seed: null,
        placement: 3,
        isDisqualified: false,
        participants: [
          {
            externalUserId: null,
            gamerTag: 'Alice',
            prefix: null,
            pronouns: null,
            country: null,
            state: null,
            city: null,
          },
        ],
      },
    ])

    const result = observer.result
    assert.isFalse(result.participantIds)
    assert.isFalse(result.seeds)
    assert.isTrue(result.placements)
  })
})

test.group('platform errors', () => {
  test('classifies retryable HTTP statuses', ({ assert }) => {
    assert.isTrue(isRetryableHttpStatus(429))
    assert.isTrue(isRetryableHttpStatus(408))
    assert.isTrue(isRetryableHttpStatus(503))
    assert.isFalse(isRetryableHttpStatus(401))
    assert.isFalse(isRetryableHttpStatus(404))
  })

  test('parses Retry-After in seconds and as a date', ({ assert }) => {
    const now = new Date('2026-03-01T00:00:00Z')

    assert.equal(parseRetryAfter('30', now), 30_000)
    assert.equal(parseRetryAfter('Sun, 01 Mar 2026 00:00:10 GMT', now), 10_000)
    assert.isUndefined(parseRetryAfter(null, now))
    assert.isUndefined(parseRetryAfter('soon', now))
  })

  test('exposes retryability on the error itself', ({ assert }) => {
    const transient = new TransientPlatformError('rate limited', {
      platform: 'fake',
      retryAfterMs: 5000,
    })
    const permanent = new PermanentPlatformError('bad key', { platform: 'fake' })

    assert.isTrue(transient.retryable)
    assert.equal(transient.retryAfterMs, 5000)
    assert.isFalse(permanent.retryable)
    assert.equal(permanent.name, 'PermanentPlatformError')
  })
})
