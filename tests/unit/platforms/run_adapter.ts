import { RecordingSink } from '#lib/platforms/recording_sink'
import { ValidatingSink } from '#lib/platforms/validating_sink'
import type { PlatformAdapter, PlatformContext, EventRef } from '#lib/platforms/contracts'

/**
 * Runs an adapter the way the pipeline does — through `ValidatingSink` — but
 * recording instead of writing.
 *
 * Every adapter test goes through this, so the contract checks apply to each
 * adapter without anything having to remember to ask for them. A violation
 * surfaces as a failed test with the same message it would produce in
 * production.
 */
export async function runAdapter(
  adapter: PlatformAdapter,
  ref: EventRef,
  context: PlatformContext
): Promise<RecordingSink> {
  const recording = new RecordingSink()
  await adapter.fetchEvent(ref, context, new ValidatingSink(adapter.key, recording))
  return recording
}

/**
 * Runs the same fixture twice and returns both records.
 *
 * Determinism is the one contract requirement `ValidatingSink` cannot check,
 * because no single run can observe it. Conversion has to be stable: the
 * pipeline retries transient failures and re-syncs on demand, so anything order-
 * or clock-dependent shows up as spurious changes on every refresh.
 */
export async function runTwice(
  adapter: PlatformAdapter,
  fixture: () => { ref: EventRef; context: PlatformContext }
): Promise<[RecordingSink, RecordingSink]> {
  const first = fixture()
  const second = fixture()

  return [
    await runAdapter(adapter, first.ref, first.context),
    await runAdapter(adapter, second.ref, second.context),
  ]
}
