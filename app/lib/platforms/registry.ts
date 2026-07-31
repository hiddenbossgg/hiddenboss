import type { PlatformAdapter, PlatformKey, EventRef } from './contracts.js'

export interface ResolvedUrl {
  adapter: PlatformAdapter
  ref: EventRef
}

/**
 * The single place that knows which platforms exist.
 *
 * Import UI, credential settings and the worker all go through here, so no
 * other module ever names a platform. Keys are plain strings validated against
 * this registry rather than a database enum, which is what keeps adding a
 * platform free of migrations.
 */
export class PlatformRegistry {
  private readonly adapters = new Map<PlatformKey, PlatformAdapter>()

  register(adapter: PlatformAdapter): this {
    if (this.adapters.has(adapter.key)) {
      throw new Error(`Platform "${adapter.key}" is already registered`)
    }

    this.adapters.set(adapter.key, adapter)
    return this
  }

  has(key: PlatformKey): boolean {
    return this.adapters.has(key)
  }

  get(key: PlatformKey): PlatformAdapter {
    const adapter = this.adapters.get(key)
    if (!adapter) {
      throw new Error(`Unknown platform "${key}"`)
    }

    return adapter
  }

  all(): PlatformAdapter[] {
    return [...this.adapters.values()]
  }

  /**
   * Finds the adapter that recognises a pasted link.
   *
   * Two adapters claiming the same URL is a bug rather than something to
   * resolve by ordering, so it throws instead of picking a winner.
   */
  resolveUrl(url: string): ResolvedUrl | null {
    const matches: ResolvedUrl[] = []

    for (const adapter of this.adapters.values()) {
      const ref = adapter.matchUrl(url)
      if (ref) {
        matches.push({ adapter, ref })
      }
    }

    if (matches.length > 1) {
      const keys = matches.map((match) => match.adapter.key).join(', ')
      throw new Error(`Ambiguous tournament URL, claimed by multiple platforms: ${keys}`)
    }

    return matches[0] ?? null
  }

  /**
   * Removes a single adapter. Tests that register a stand-in should undo just
   * that registration — clearing the whole registry would also drop the real
   * adapters registered at boot and break every later test.
   */
  unregister(key: PlatformKey): void {
    this.adapters.delete(key)
  }

  /** Test helper. Not used at runtime. */
  clear(): void {
    this.adapters.clear()
  }
}

export const platforms = new PlatformRegistry()
