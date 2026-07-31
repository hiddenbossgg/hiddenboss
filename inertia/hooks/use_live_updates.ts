import { useEffect, useRef, useState } from 'react'
import { usePoll } from '@inertiajs/react'

/**
 * Refreshes the page while background work is in flight.
 *
 * Imports and recomputes run in the worker process, so the page that started
 * them renders once and then goes stale — progress lands in the database where
 * nobody is looking. Polling with a partial reload is enough here: with the
 * worker in a separate process and no Redis by design, pushing updates would
 * need a broker the stack does not have.
 *
 * Gives up after `maxPolls` so a job that never runs — most often because no
 * worker is running at all — does not reload forever. `gaveUp` lets the page say
 * so. There is no reset, because starting work means submitting a form, and that
 * navigation remounts the page with fresh state.
 */
export function useLiveUpdates(
  active: boolean,
  options: { only: string[]; intervalMs?: number; maxPolls?: number }
): { gaveUp: boolean } {
  const { only, intervalMs = 2000, maxPolls = 45 } = options

  const [exhausted, setExhausted] = useState(false)
  const polls = useRef(0)

  const { start, stop } = usePoll(
    intervalMs,
    {
      only,
      onStart: () => {
        polls.current += 1
      },
    },
    { autoStart: false }
  )

  useEffect(() => {
    if (!active || exhausted) {
      stop()
      return
    }

    start()
    return stop
  }, [active, exhausted, start, stop])

  useEffect(() => {
    if (!active || exhausted) return

    // Checked on a timer rather than in the poll callback, so a request that
    // never resolves still trips the limit.
    const timer = setInterval(() => {
      if (polls.current >= maxPolls) setExhausted(true)
    }, intervalMs)

    return () => clearInterval(timer)
  }, [active, exhausted, intervalMs, maxPolls])

  return { gaveUp: active && exhausted }
}
