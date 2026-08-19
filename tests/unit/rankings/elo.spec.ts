import { test } from '@japa/runner'
import { Elo, expectedScore } from '#lib/rankings/elo'
import type { RatableSet } from '#lib/rankings/contracts'

function match(overrides: Partial<RatableSet> = {}): RatableSet {
  return {
    setId: 's1',
    tournamentId: 't1',
    tournamentStartAt: new Date('2026-01-01T00:00:00Z'),
    sideA: ['a'],
    sideB: ['b'],
    winner: 'a',
    occurredAt: new Date('2026-01-01T00:00:00Z'),
    entrantCount: null,
    sideADisqualified: false,
    sideBDisqualified: false,
    ...overrides,
  }
}

test.group('elo expected score', () => {
  test('equal ratings are an even match', ({ assert }) => {
    assert.equal(expectedScore(1500, 1500), 0.5)
  })

  /**
   * The textbook figure: a 200-point lead is roughly a 76% chance of winning.
   */
  test('a 200 point lead is about 76 percent', ({ assert }) => {
    assert.closeTo(expectedScore(1600, 1400), 0.7597, 0.0001)
  })

  test('a 400 point lead is about 91 percent', ({ assert }) => {
    assert.closeTo(expectedScore(1800, 1400), 0.9091, 0.0001)
  })

  test('expectations of both sides sum to one', ({ assert }) => {
    assert.closeTo(expectedScore(1650, 1480) + expectedScore(1480, 1650), 1, 1e-12)
  })
})

test.group('elo ratings', () => {
  test('an even match moves both players by half of K', ({ assert }) => {
    // Fixed K so the provisional multiplier does not confuse the arithmetic.
    const elo = new Elo({ k: 32, kProvisional: 32, provisionalSets: 0 })
    const state = elo.init()

    const changes = elo.applySet(state, match())

    assert.closeTo(changes[0].after, 1516, 1e-9)
    assert.closeTo(changes[1].after, 1484, 1e-9)
  })

  test('beating a much weaker opponent gains little', ({ assert }) => {
    const elo = new Elo({ k: 32, kProvisional: 32, provisionalSets: 0 })
    const state = elo.init()

    // Establish a gap: 1600 vs 1400.
    state.players.set('a', { rating: 1600, wins: 0, losses: 0, setsPlayed: 99 })
    state.players.set('b', { rating: 1400, wins: 0, losses: 0, setsPlayed: 99 })

    // E(1600 vs 1400) = 0.7597469..., so the favourite gains 32 * 0.2402531.
    const changes = elo.applySet(state, match())
    assert.closeTo(changes[0].after, 1607.6880983, 0.0000001)
    assert.closeTo(changes[1].after, 1392.3119017, 0.0000001)
  })

  test('an upset moves ratings a long way', ({ assert }) => {
    const elo = new Elo({ k: 32, kProvisional: 32, provisionalSets: 0 })
    const state = elo.init()

    state.players.set('a', { rating: 1600, wins: 0, losses: 0, setsPlayed: 99 })
    state.players.set('b', { rating: 1400, wins: 0, losses: 0, setsPlayed: 99 })

    // The underdog gains 32 * 0.7597469, more than three times the favourite's
    // gain for the same result reversed.
    const changes = elo.applySet(state, match({ winner: 'b' }))
    assert.closeTo(changes[0].after, 1575.6880983, 0.0000001)
    assert.closeTo(changes[1].after, 1424.3119017, 0.0000001)
  })

  test('rating is conserved between the two players', ({ assert }) => {
    const elo = new Elo({ k: 32, kProvisional: 32, provisionalSets: 0 })
    const state = elo.init()

    const changes = elo.applySet(state, match())
    const before = changes[0].before + changes[1].before
    const after = changes[0].after + changes[1].after

    // Only true while both players share the same K, which this config forces.
    assert.closeTo(after, before, 1e-9)
  })

  test('newcomers move faster than established players', ({ assert }) => {
    const elo = new Elo({ k: 32, kProvisional: 48, provisionalSets: 10 })
    const state = elo.init()

    state.players.set('b', { rating: 1500, wins: 0, losses: 0, setsPlayed: 99 })

    const changes = elo.applySet(state, match())
    const newcomer = changes.find((change) => change.leaguePlayerId === 'a')!
    const veteran = changes.find((change) => change.leaguePlayerId === 'b')!

    assert.closeTo(newcomer.after, 1524, 1e-9) // 48 * 0.5
    assert.closeTo(veteran.after, 1484, 1e-9) // 32 * 0.5
  })

  /**
   * Every team-credit convention is arguable, so doubles is imported and shown
   * but deliberately not rated until TrueSkill exists.
   */
  test('team matches are not rated', ({ assert }) => {
    const elo = new Elo()
    const state = elo.init()

    const changes = elo.applySet(state, match({ sideA: ['a', 'b'], sideB: ['c', 'd'] }))

    assert.isEmpty(changes)
    assert.equal(state.players.size, 0)
  })

  test('a player cannot be rated against themselves', ({ assert }) => {
    const elo = new Elo()
    const state = elo.init()

    // Happens for real once two entrants merge into one player.
    const changes = elo.applySet(state, match({ sideA: ['a'], sideB: ['a'] }))

    assert.isEmpty(changes)
  })

  test('tracks wins, losses and sets played', ({ assert }) => {
    const elo = new Elo()
    const state = elo.init()

    elo.applySet(state, match({ winner: 'a' }))
    elo.applySet(state, match({ setId: 's2', winner: 'b' }))

    const standings = elo.finalize(state)
    const a = standings.find((standing) => standing.leaguePlayerId === 'a')!

    assert.equal(a.wins, 1)
    assert.equal(a.losses, 1)
    assert.equal(a.setsPlayed, 2)
  })

  test('finalize sorts by rating, best first', ({ assert }) => {
    const elo = new Elo()
    const state = elo.init()

    elo.applySet(state, match({ sideA: ['winner'], sideB: ['loser'] }))
    const standings = elo.finalize(state)

    assert.equal(standings[0].leaguePlayerId, 'winner')
    assert.isAbove(standings[0].value, standings[1].value)
  })

  test('is order dependent, which is why a recompute replays from scratch', ({ assert }) => {
    const build = (winners: Array<'a' | 'b'>) => {
      const elo = new Elo()
      const state = elo.init()
      winners.forEach((winner, index) => elo.applySet(state, match({ setId: `s${index}`, winner })))
      return elo.finalize(state).find((standing) => standing.leaguePlayerId === 'a')!.value
    }

    // Same results, different order: provisional K makes the paths diverge.
    assert.notEqual(build(['a', 'a', 'b']), build(['b', 'a', 'a']))
  })

  test('serialized state round-trips the ratings', ({ assert }) => {
    const elo = new Elo()
    const state = elo.init()
    elo.applySet(state, match())

    const serialized = elo.serialize(state) as { algorithm: string; players: Record<string, any> }

    assert.equal(serialized.algorithm, 'elo')
    assert.properties(serialized.players, ['a', 'b'])
  })
})
