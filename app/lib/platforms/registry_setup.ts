import { ManualAdapter } from '#lib/platforms/manual/adapter'
import { ParryggAdapter } from '#lib/platforms/parrygg/adapter'
import { StartggAdapter } from '#lib/platforms/startgg/adapter'
import { platforms } from '#lib/platforms/registry'

/**
 * The one place platforms are wired up.
 *
 * Adding a platform is an import and a line here. If it ever requires touching
 * anything else, that is a defect in the adapter contract rather than a case to
 * special-case — see docs/platform-adapters.md.
 */
export function registerPlatforms(): void {
  if (platforms.all().length > 0) return

  platforms.register(new StartggAdapter())
  platforms.register(new ParryggAdapter())
  platforms.register(new ManualAdapter())
}
