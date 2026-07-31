import { test } from '@japa/runner'
import { createPlatformHttp } from '#lib/platforms/http'
import { PermanentPlatformError, TransientPlatformError } from '#lib/platforms/errors'

/**
 * Time is injected throughout so backoff and pacing are asserted exactly
 * rather than waited on.
 */
function harness(
  responses: Array<Response | Error>,
  // Generous by default so retry tests measure backoff alone. Pacing and
  // backoff do compose — a throttled retry waits for both — but that is worth
  // asserting on its own rather than tangled into every other case.
  rateLimit = { requests: 100, perSeconds: 60 }
) {
  const slept: number[] = []
  let clock = 0
  let calls = 0

  const http = createPlatformHttp({
    platform: 'fake',
    rateLimit,
    signal: new AbortController().signal,
    fetch: async () => {
      const next = responses[calls]
      calls += 1
      if (next instanceof Error) throw next
      return next
    },
    sleep: async (ms) => {
      slept.push(ms)
      clock += ms
    },
    now: () => clock,
  })

  return { http, slept, calls: () => calls }
}

function response(status: number, headers: Record<string, string> = {}) {
  return new Response(null, { status, headers })
}

test.group('platform http', () => {
  test('returns a successful response without sleeping', async ({ assert }) => {
    const { http, slept } = harness([response(200)])

    const result = await http('https://fake.test/a')

    assert.equal(result.status, 200)
    assert.isEmpty(slept)
  })

  test('does not retry a rejected credential', async ({ assert }) => {
    const { http, calls } = harness([response(401)])

    await assert.rejects(() => http('https://fake.test/a'), PermanentPlatformError)
    // Waiting cannot turn a wrong API key into a right one.
    assert.equal(calls(), 1)
  })

  test('does not retry a missing tournament', async ({ assert }) => {
    const { http, calls } = harness([response(404)])

    await assert.rejects(() => http('https://fake.test/a'), PermanentPlatformError)
    assert.equal(calls(), 1)
  })

  test('retries a server error and succeeds', async ({ assert }) => {
    const { http, slept, calls } = harness([response(503), response(200)])

    const result = await http('https://fake.test/a')

    assert.equal(result.status, 200)
    assert.equal(calls(), 2)
    assert.deepEqual(slept, [1000])
  })

  test('backs off exponentially before giving up', async ({ assert }) => {
    const { http, slept } = harness([response(500), response(500), response(500), response(500)])

    await assert.rejects(() => http('https://fake.test/a'), TransientPlatformError)
    assert.deepEqual(slept, [1000, 2000, 4000])
  })

  test('honours Retry-After over its own backoff', async ({ assert }) => {
    const { http, slept } = harness([response(429, { 'retry-after': '7' }), response(200)])

    await http('https://fake.test/a')

    assert.deepEqual(slept, [7000])
  })

  test('retries transport failures', async ({ assert }) => {
    const { http, calls } = harness([new Error('ECONNRESET'), response(200)])

    const result = await http('https://fake.test/a')

    assert.equal(result.status, 200)
    assert.equal(calls(), 2)
  })

  test('paces requests to stay inside the declared rate limit', async ({ assert }) => {
    // Two requests per 60s, so the third has to wait out the window.
    const { http, slept } = harness([response(200), response(200), response(200)], {
      requests: 2,
      perSeconds: 60,
    })

    await http('https://fake.test/a')
    await http('https://fake.test/b')
    assert.isEmpty(slept)

    await http('https://fake.test/c')
    assert.deepEqual(slept, [60_000])
  })

  test('stops immediately when the import is aborted', async ({ assert }) => {
    const controller = new AbortController()
    const http = createPlatformHttp({
      platform: 'fake',
      rateLimit: { requests: 10, perSeconds: 60 },
      signal: controller.signal,
      fetch: async () => response(200),
    })

    controller.abort(new Error('cancelled'))

    await assert.rejects(() => http('https://fake.test/a'), /cancelled/)
  })
})
