import { test } from '@japa/runner'
import { glicko2 } from 'glicko2-lite'
import { Glicko2 } from '#lib/rankings/glicko2'
import type { RatableSet } from '#lib/rankings/contracts'

function set(a: string, b: string, winner: 'a' | 'b'): RatableSet {
  return {
    setId: `${a}-${b}-${winner}`,
    tournamentId: 't1',
    tournamentStartAt: new Date('2026-01-01'),
    sideA: [a],
    sideB: [b],
    winner,
    occurredAt: new Date('2026-01-01'),
    entrantCount: null,
    sideADisqualified: false,
    sideBDisqualified: false,
  }
}

/**
 * Checked against the worked example in Glickman's own paper.
 *
 * The arithmetic belongs to `glicko2-lite`, so this is a test of the dependency
 * rather than of our code — which is the point. It pins the behaviour we rely on
 * and would catch an upgrade that changed it.
 *
 * "Example of the Glicko-2 system", Mark E. Glickman, 2013: a player rated 1500
 * with RD 200 and volatility 0.06 plays three opponents in one rating period —
 * beating 1400/RD 30, then losing to 1550/RD 100 and 1700/RD 300.
 */
test.group('glicko2 against the published example', () => {
  const player = { rating: 1500, deviation: 200, volatility: 0.06 }
  const results = [
    { opponentRating: 1400, opponentDeviation: 30, score: 1 },
    { opponentRating: 1550, opponentDeviation: 100, score: 0 },
    { opponentRating: 1700, opponentDeviation: 300, score: 0 },
  ]

  test('reproduces the rating, deviation and volatility', ({ assert }) => {
    const next = glicko2(
      player.rating,
      player.deviation,
      player.volatility,
      results.map((r) => [r.opponentRating, r.opponentDeviation, r.score] as const),
      { tau: 0.5 }
    )

    assert.closeTo(next.rating, 1464.06, 0.01)
    assert.closeTo(next.rd, 151.52, 0.01)
    assert.closeTo(next.vol, 0.05999, 0.00001)
  })

  /**
   * A player who sits out a period does not change rating, only certainty.
   * Without this an absence would read as current form.
   */
  test('an idle period widens the deviation and leaves the rating alone', ({ assert }) => {
    const next = glicko2(player.rating, player.deviation, player.volatility, [], { tau: 0.5 })

    assert.equal(next.rating, 1500)
    assert.isAbove(next.rd, 200)
    assert.equal(next.vol, 0.06)
  })
})

test.group('glicko2 as a ranking algorithm', () => {
  test('a win raises the winner and lowers the loser', ({ assert }) => {
    const glicko = new Glicko2()
    const state = glicko.init()

    const deltas = glicko.applySet(state, set('alice', 'bob', 'a'))

    assert.lengthOf(deltas, 2)
    const [alice, bob] = deltas
    assert.isAbove(alice.after, alice.before)
    assert.isBelow(bob.after, bob.before)
  })

  /** Equal players, so the gain and the loss must mirror each other exactly. */
  test('is symmetric between identically rated players', ({ assert }) => {
    const glicko = new Glicko2()
    const state = glicko.init()

    const [alice, bob] = glicko.applySet(state, set('alice', 'bob', 'a'))

    assert.closeTo(alice.after - alice.before, bob.before - bob.after, 0.000001)
  })

  test('deviation shrinks as results accumulate', ({ assert }) => {
    const glicko = new Glicko2()
    const state = glicko.init()

    glicko.applySet(state, set('alice', 'bob', 'a'))
    const afterOne = glicko.finalize(state).find((row) => row.leaguePlayerId === 'alice')!

    for (let index = 0; index < 5; index += 1) {
      glicko.applySet(state, set('alice', `rival-${index}`, 'a'))
    }
    const afterMany = glicko.finalize(state).find((row) => row.leaguePlayerId === 'alice')!

    assert.isBelow(afterMany.deviation!, afterOne.deviation!)
    assert.isBelow(afterMany.deviation!, 350)
  })

  test('beating a stronger player is worth more than beating a weaker one', ({ assert }) => {
    const glicko = new Glicko2()

    const versusWeak = glicko.init()
    // Give the weak opponent a losing record first, so the two differ in rating.
    for (let index = 0; index < 6; index += 1) {
      glicko.applySet(versusWeak, set('feeder', `strong-${index}`, 'b'))
    }
    const weakGain = glicko.applySet(versusWeak, set('alice', 'feeder', 'a'))[0]

    const versusStrong = glicko.init()
    for (let index = 0; index < 6; index += 1) {
      glicko.applySet(versusStrong, set('champ', `victim-${index}`, 'a'))
    }
    const strongGain = glicko.applySet(versusStrong, set('alice', 'champ', 'a'))[0]

    assert.isAbove(strongGain.after - strongGain.before, weakGain.after - weakGain.before)
  })

  test('skips team sets, as Elo does', ({ assert }) => {
    const glicko = new Glicko2()
    const state = glicko.init()

    const doubles: RatableSet = { ...set('alice', 'bob', 'a'), sideA: ['alice', 'carol'] }

    assert.lengthOf(glicko.applySet(state, doubles), 0)
    assert.lengthOf(glicko.finalize(state), 0)
  })

  test('reports standings highest first, carrying deviation and volatility', ({ assert }) => {
    const glicko = new Glicko2()
    const state = glicko.init()

    glicko.applySet(state, set('alice', 'bob', 'a'))
    const standings = glicko.finalize(state)

    assert.equal(standings[0].leaguePlayerId, 'alice')
    assert.isNotNull(standings[0].deviation)
    assert.isNotNull(standings[0].volatility)
  })
})
