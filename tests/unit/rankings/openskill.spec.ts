import { test } from '@japa/runner'
import { OpenSkill } from '#lib/rankings/openskill'
import type { RatableSet } from '#lib/rankings/contracts'

function set(sideA: string[], sideB: string[], winner: 'a' | 'b' = 'a'): RatableSet {
  return {
    setId: `${sideA.join('+')}-${sideB.join('+')}-${winner}`,
    tournamentId: 't1',
    tournamentStartAt: new Date('2026-01-01'),
    sideA,
    sideB,
    winner,
    occurredAt: new Date('2026-01-01'),
  }
}

test.group('openskill', () => {
  test('a win raises the winner and lowers the loser', ({ assert }) => {
    const openskill = new OpenSkill()
    const state = openskill.init()

    const deltas = openskill.applySet(state, set(['alice'], ['bob']))

    assert.lengthOf(deltas, 2)
    const alice = deltas.find((delta) => delta.leaguePlayerId === 'alice')!
    const bob = deltas.find((delta) => delta.leaguePlayerId === 'bob')!

    assert.isAbove(alice.after, alice.before)
    assert.isBelow(bob.after, bob.before)
  })

  /**
   * The published number is the conservative estimate `mu - 3 * sigma`, so a
   * newcomer starts low and climbs as uncertainty falls rather than as skill
   * changes. Worth pinning: it is why everybody begins on zero.
   */
  test('publishes the conservative estimate, not the mean', ({ assert }) => {
    const openskill = new OpenSkill()
    const state = openskill.init()

    openskill.applySet(state, set(['alice'], ['bob']))
    const [top] = openskill.finalize(state)

    assert.isBelow(top.value, 25, 'below the mean of 25 while uncertainty is high')
    assert.isNotNull(top.deviation)
  })

  test('uncertainty falls as results accumulate', ({ assert }) => {
    const openskill = new OpenSkill()
    const state = openskill.init()

    openskill.applySet(state, set(['alice'], ['bob']))
    const first = openskill.finalize(state).find((row) => row.leaguePlayerId === 'alice')!

    for (let index = 0; index < 8; index += 1) {
      openskill.applySet(state, set(['alice'], [`rival-${index}`]))
    }
    const later = openskill.finalize(state).find((row) => row.leaguePlayerId === 'alice')!

    assert.isBelow(later.deviation!, first.deviation!)
    assert.isAbove(later.value, first.value)
  })

  test('records wins and losses per player', ({ assert }) => {
    const openskill = new OpenSkill()
    const state = openskill.init()

    openskill.applySet(state, set(['alice'], ['bob'], 'a'))
    openskill.applySet(state, set(['alice'], ['bob'], 'b'))

    const alice = openskill.finalize(state).find((row) => row.leaguePlayerId === 'alice')!
    assert.equal(alice.wins, 1)
    assert.equal(alice.losses, 1)
    assert.equal(alice.setsPlayed, 2)
  })

  /**
   * Happens when identity resolution maps both entrants of a set to one player.
   * Elo guards the same case; the model would otherwise have somebody beating
   * themselves.
   */
  test('skips a set with the same player on both sides', ({ assert }) => {
    const openskill = new OpenSkill()
    const state = openskill.init()

    assert.lengthOf(openskill.applySet(state, set(['alice'], ['alice'])), 0)
    assert.lengthOf(openskill.finalize(state), 0)
  })

  test('skips a set with an empty side', ({ assert }) => {
    const openskill = new OpenSkill()
    const state = openskill.init()

    assert.lengthOf(openskill.applySet(state, set([], ['bob'])), 0)
  })

  test('reports standings highest first', ({ assert }) => {
    const openskill = new OpenSkill()
    const state = openskill.init()

    for (let index = 0; index < 5; index += 1) {
      openskill.applySet(state, set(['alice'], [`rival-${index}`]))
    }

    const standings = openskill.finalize(state)
    assert.equal(standings[0].leaguePlayerId, 'alice')

    const values = standings.map((row) => row.value)
    assert.deepEqual(
      values,
      [...values].sort((left, right) => right - left)
    )
  })
})
