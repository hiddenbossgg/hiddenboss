import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'

test.group('smoke', () => {
  test('the test runner executes', ({ assert }) => {
    assert.isTrue(true)
  })

  test('the app can reach postgres', async ({ assert }) => {
    const result = await db.rawQuery('select version() as version')
    assert.match(result.rows[0].version, /PostgreSQL/)
  })
})
