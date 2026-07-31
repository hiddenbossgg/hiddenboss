import { test } from '@japa/runner'
import logger from '@adonisjs/core/services/logger'
import { ManualAdapter } from '#lib/platforms/manual/adapter'
import { runAdapter, runTwice } from './run_adapter.js'
import { PermanentPlatformError } from '#lib/platforms/errors'
import type { PlatformContext, EventRef } from '#lib/platforms/contracts'

const ENTRANTS = `name,seed,placement,dq
Alice,1,1,
Bob,2,2,
Carol,3,3,yes
`

const SETS = `round,identifier,entrant_a,entrant_b,score_a,score_b,winner
1,A,Alice,Bob,3,1,
1,B,Bob,Carol,2,0,Bob
`

function context(): PlatformContext {
  return {
    credentials: {},
    http: () => Promise.reject(new Error('the manual adapter performs no HTTP')),
    signal: new AbortController().signal,
    logger,
  }
}

function ref(payload: Record<string, unknown>): EventRef {
  return { platform: 'manual', slug: 'local-weekly', url: null, payload }
}

async function collect(adapter: ManualAdapter, payload: Record<string, unknown>) {
  return runAdapter(adapter, ref(payload), context())
}

const basePayload = {
  name: 'Local Weekly #12',
  slug: 'local-weekly-12',
  entrants: ENTRANTS,
  sets: SETS,
}

test.group('manual adapter', () => {
  test('satisfies the import contract', async ({ assert }) => {
    const sink = await collect(new ManualAdapter(), basePayload)

    assert.isAbove(sink.calls.length, 0)
    assert.lengthOf(sink.tournaments, 1)
    assert.lengthOf(sink.brackets, 1)
  })

  // No URL form: this adapter is selected by key with a payload instead.
  test('claims no URLs', ({ assert }) => {
    const adapter = new ManualAdapter()

    assert.isNull(adapter.matchUrl())
  })

  test('converts the same payload identically every time', async ({ assert }) => {
    const [first, second] = await runTwice(new ManualAdapter(), () => ({
      ref: ref(basePayload),
      context: context(),
    }))

    assert.deepEqual(
      JSON.parse(JSON.stringify(second.calls)),
      JSON.parse(JSON.stringify(first.calls))
    )
  })

  test('reads entrants with seeds, placements and disqualifications', async ({ assert }) => {
    const sink = await collect(new ManualAdapter(), basePayload)
    const entrants = sink.entrantBatches[0]

    assert.lengthOf(entrants.entrants, 3)
    assert.deepInclude(entrants.entrants[0], { name: 'Alice', seed: 1, placement: 1 })
    assert.isTrue(entrants.entrants[2].isDisqualified)
  })

  test('reports no cross-tournament identity', async ({ assert }) => {
    const sink = await collect(new ManualAdapter(), basePayload)
    const entrants = sink.entrantBatches[0]

    // A CSV has no account concept, so identity can only ever match by tag.
    for (const entrant of entrants.entrants) {
      assert.isNull(entrant.participants[0].externalUserId)
    }
  })

  test('infers the winner from the scores when it is not stated', async ({ assert }) => {
    const sink = await collect(new ManualAdapter(), basePayload)
    const bracket = sink.brackets[0]

    assert.equal(bracket.bracket.sets[0].winnerEntrantExternalId, 'alice')
    assert.equal(bracket.bracket.sets[0].state, 'completed')
  })

  test('prefers an explicit winner over the scores', async ({ assert }) => {
    const sink = await collect(new ManualAdapter(), basePayload)
    const bracket = sink.brackets[0]

    assert.equal(bracket.bracket.sets[1].winnerEntrantExternalId, 'bob')
  })

  test('leaves a tied set pending rather than guessing', async ({ assert }) => {
    const sink = await collect(new ManualAdapter(), {
      ...basePayload,
      sets: 'entrant_a,entrant_b,score_a,score_b\nAlice,Bob,1,1\n',
    })
    const bracket = sink.brackets[0]

    assert.isNull(bracket.bracket.sets[0].winnerEntrantExternalId)
    assert.equal(bracket.bracket.sets[0].state, 'pending')
  })

  test('rejects a match against someone not in the entrants file', async ({ assert }) => {
    await assert.rejects(
      () =>
        collect(new ManualAdapter(), {
          ...basePayload,
          sets: 'entrant_a,entrant_b,score_a,score_b\nAlice,Nobody,3,0\n',
        }),
      /not in the entrants file/
    )
  })

  test('rejects duplicate entrant names', async ({ assert }) => {
    await assert.rejects(
      () =>
        collect(new ManualAdapter(), {
          ...basePayload,
          entrants: 'name\nAlice\nalice\n',
          sets: undefined,
        }),
      /more than once/
    )
  })

  test('accepts quoted names containing commas', async ({ assert }) => {
    const sink = await collect(new ManualAdapter(), {
      ...basePayload,
      entrants: 'name\n"Smith, John"\nBob\n',
      sets: undefined,
    })
    const entrants = sink.entrantBatches[0]

    assert.equal(entrants.entrants[0].name, 'Smith, John')
  })

  test('explains a malformed file instead of failing obscurely', async ({ assert }) => {
    await assert.rejects(
      () => collect(new ManualAdapter(), { ...basePayload, entrants: 'name,seed\nAlice\n' }),
      /has 1 values but there are 2 columns/
    )
  })

  test('requires entrants', async ({ assert }) => {
    await assert.rejects(
      () => collect(new ManualAdapter(), { name: 'x', slug: 'x' }),
      PermanentPlatformError
    )
  })

  test('reads a DQ column as a walkover with no score', async ({ assert }) => {
    const sink = await collect(new ManualAdapter(), {
      ...basePayload,
      sets: 'entrant_a,entrant_b,dq_b\nAlice,Bob,yes\n',
    })

    const [set] = sink.brackets[0].bracket.sets
    assert.isTrue(set.entrantBDisqualified)
    assert.isFalse(set.entrantADisqualified)
    // The side that turned up advances, and neither side has a score.
    assert.equal(set.winnerEntrantExternalId, 'alice')
    assert.isNull(set.scoreA)
    assert.isNull(set.scoreB)
    assert.equal(set.state, 'completed')
  })

  test('a double DQ decides nothing', async ({ assert }) => {
    const sink = await collect(new ManualAdapter(), {
      ...basePayload,
      sets: 'entrant_a,entrant_b,dq_a,dq_b\nAlice,Bob,yes,yes\n',
    })

    const [set] = sink.brackets[0].bracket.sets
    assert.isTrue(set.entrantADisqualified)
    assert.isTrue(set.entrantBDisqualified)
    assert.isNull(set.winnerEntrantExternalId)
    assert.equal(set.state, 'pending')
  })
})
