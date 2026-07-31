import { test } from '@japa/runner'
import vine from '@vinejs/vine'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ParryggAdapter } from '#lib/platforms/parrygg/adapter'
import { runAdapter, runTwice } from './run_adapter.js'
import { fixtureContext, hasFixtures } from './fixture_http.js'

const FIXTURE_ROOT = new URL('../../fixtures/platforms/', import.meta.url).pathname

/**
 * Recording needs a parry.gg API key; replaying does not:
 *
 *   node ace record:platform-fixtures parrygg <event url> --credentials='{"apiKey":"..."}'
 */
const recorded = await hasFixtures('parrygg')
const manifest: { events: Array<{ url: string; slug: string }> } = recorded
  ? JSON.parse(await readFile(join(FIXTURE_ROOT, 'parrygg', 'manifest.json'), 'utf8'))
  : { events: [] }

const eventUrl = (kind: 'singles' | 'doubles') =>
  manifest.events.find((event) => event.url.endsWith(kind))!.url

async function recordedSink(kind: 'singles' | 'doubles' = 'singles') {
  const adapter = new ParryggAdapter()
  const context = await fixtureContext('parrygg')

  return runAdapter(adapter, adapter.matchUrl(eventUrl(kind))!, context)
}

test.group('parrygg adapter', () => {
  test('recognises event URLs', ({ assert }) => {
    const adapter = new ParryggAdapter()

    assert.deepInclude(adapter.matchUrl('https://parry.gg/foco/melee-singles')!, {
      platform: 'parrygg',
      slug: 'foco/melee-singles',
    })

    assert.deepInclude(adapter.matchUrl('https://www.parry.gg/foco/melee-doubles')!, {
      slug: 'foco/melee-doubles',
    })
  })

  /**
   * A tournament link is ours, so it must not report as unrecognised — the
   * adapter answers with the events to choose from instead.
   */
  test('recognises a tournament URL but does not treat it as an event', ({ assert }) => {
    const adapter = new ParryggAdapter()

    assert.deepInclude(adapter.matchUrl('https://parry.gg/foco')!, { slug: 'foco' })
  })

  test('rejects URLs belonging to other platforms', ({ assert }) => {
    const adapter = new ParryggAdapter()

    assert.isNull(adapter.matchUrl('https://www.start.gg/tournament/genesis-9'))
    assert.isNull(adapter.matchUrl('https://parry.gg'))
    assert.isNull(adapter.matchUrl('not a url'))
  })

  test('rejects an empty credential payload', async ({ assert }) => {
    const adapter = new ParryggAdapter()
    const validator = vine.compile(adapter.credentials.schema)

    await assert.rejects(() => validator.validate({}))
  })

  test('satisfies the import contract against recorded responses', async ({ assert }) => {
    const sink = await recordedSink()

    assert.lengthOf(sink.tournaments, 1)
    assert.lengthOf(sink.events, 1, 'an import covers exactly one event')
    assert.isAbove(sink.brackets.length, 0)
  }).skip(!recorded, 'no parry.gg fixtures recorded yet')

  test('converts the same responses identically every time', async ({ assert }) => {
    const adapter = new ParryggAdapter()
    const context = await fixtureContext('parrygg')

    const [first, second] = await runTwice(adapter, () => ({
      ref: adapter.matchUrl(eventUrl('singles'))!,
      context,
    }))

    assert.deepEqual(
      JSON.parse(JSON.stringify(second.calls)),
      JSON.parse(JSON.stringify(first.calls))
    )
  }).skip(!recorded, 'no parry.gg fixtures recorded yet')

  test('reads entrants with stable user ids', async ({ assert }) => {
    const sink = await recordedSink()

    assert.isAbove(sink.allEntrants.length, 0)
    for (const entrant of sink.allEntrants) {
      assert.isAbove(entrant.participants.length, 0)
      for (const participant of entrant.participants) {
        assert.isNotNull(participant.externalUserId, `${entrant.name} has an unidentified player`)
      }
    }
  }).skip(!recorded, 'no parry.gg fixtures recorded yet')

  /**
   * parry.gg publishes its own round labels on the bracket rather than leaving
   * them to be synthesised from a round number, so they should survive intact.
   */
  test('keeps the platform round labels', async ({ assert }) => {
    const sink = await recordedSink()
    const sets = sink.brackets.flatMap((call) => call.bracket.sets)

    const labelled = sets.filter((set) => set.fullRoundText !== null)
    assert.isAbove(labelled.length, 0)
    assert.isTrue(
      labelled.some((set) => /Winners|Losers|Grand/i.test(set.fullRoundText!)),
      'expected labels like "Winners Quarter-Final"'
    )
  }).skip(!recorded, 'no parry.gg fixtures recorded yet')

  /** Losers-side rounds are negative, matching the canonical convention. */
  test('signs the round by bracket side', async ({ assert }) => {
    const sink = await recordedSink()
    const sets = sink.brackets.flatMap((call) => call.bracket.sets)

    assert.isTrue(sets.some((set) => (set.round ?? 0) > 0))
    assert.isTrue(sets.some((set) => (set.round ?? 0) < 0))
  }).skip(!recorded, 'no parry.gg fixtures recorded yet')

  test('reads a doubles event as multi-player entrants', async ({ assert }) => {
    const sink = await recordedSink('doubles')

    const [event] = sink.events
    assert.equal(event.entryKind, 'doubles')
    assert.equal(event.teamSize, 2)

    const teams = sink.allEntrants.filter((entrant) => entrant.participants.length > 1)
    assert.isAbove(teams.length, 0)
  }).skip(!recorded, 'no parry.gg fixtures recorded yet')

  test('reports completed sets with a winner and scores', async ({ assert }) => {
    const sink = await recordedSink()
    const sets = sink.brackets.flatMap((call) => call.bracket.sets)

    const completed = sets.filter((set) => set.state === 'completed')
    assert.isAbove(completed.length, 0)

    for (const set of completed) {
      assert.isNotNull(set.winnerEntrantExternalId, `set ${set.externalId} has no winner`)
    }
  }).skip(!recorded, 'no parry.gg fixtures recorded yet')

  /**
   * The winner is the side that scored more. Asserting a winner merely exists
   * passes just as happily when every result is inverted, which is how reading
   * parry.gg's zero-indexed match placement as one-indexed went unnoticed.
   */
  test('names the higher-scoring side as the winner', async ({ assert }) => {
    const sink = await recordedSink()
    const sets = sink.brackets.flatMap((call) => call.bracket.sets)

    const scored = sets.filter(
      (set) => set.state === 'completed' && set.scoreA !== null && set.scoreB !== null
    )
    assert.isAbove(scored.length, 0)

    for (const set of scored) {
      if (set.scoreA === set.scoreB) continue

      const expected = set.scoreA! > set.scoreB! ? set.entrantAExternalId : set.entrantBExternalId

      assert.equal(
        set.winnerEntrantExternalId,
        expected,
        `set ${set.externalId} scored ${set.scoreA}-${set.scoreB} but named the other side`
      )
    }
  }).skip(!recorded, 'no parry.gg fixtures recorded yet')
})
