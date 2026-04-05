import type { SearchProvider } from "./provider.js";
import type { RawSearchResult } from "../types.js";

export interface DiscoverOptions {
  graceMs?: number; // Grace period after first provider returns enough results (default 150)
  timeoutMs?: number; // Hard timeout for entire discover call (default 5000)
}

export class SearchEngine {
  private providers: SearchProvider[];
  private _lastEnginesUsed: string[] = [];

  constructor(providers: SearchProvider[]) {
    this.providers = providers.sort((a, b) => a.tier - b.tier);
  }

  get lastEnginesUsed(): string[] {
    return [...this._lastEnginesUsed];
  }

  async discover(
    query: string,
    maxResults = 10,
    options?: DiscoverOptions,
  ): Promise<RawSearchResult[]> {
    const available = this.providers.filter((p) => p.isAvailable());
    if (available.length === 0) {
      this._lastEnginesUsed = [];
      return [];
    }

    const globalTimeout = options?.timeoutMs ?? 5000;
    const globalStart = Date.now();

    // Split by tier: tier-0 runs immediately, tier-1+ only if tier-0 is insufficient
    const tier0 = available.filter((p) => p.tier === 0);
    const tierFallback = available.filter((p) => p.tier > 0);

    // Phase 1: race tier-0 providers
    const tier0Results = await this.raceProviders(tier0, query, maxResults, {
      ...options,
      timeoutMs: globalTimeout,
    });

    // Phase 2: if tier-0 returned zero results and we have fallback providers,
    // try them with the remaining time budget. We check for zero (not < maxResults)
    // because tier-0 may return partial results that verification/deep-mode still
    // needs fallback corroboration for — but launching fallback for every partial
    // result would negate the privacy benefit. Zero results is the unambiguous signal.
    const elapsed = Date.now() - globalStart;
    const remainingMs = globalTimeout - elapsed;
    if (
      this.deduplicateCount(tier0Results) === 0 &&
      tierFallback.length > 0 &&
      remainingMs > 500
    ) {
      const fallbackResults = await this.raceProviders(
        tierFallback,
        query,
        maxResults,
        { ...options, timeoutMs: remainingMs },
      );
      tier0Results.push(...fallbackResults);
      this._lastEnginesUsed = [
        ...new Set([...tier0, ...tierFallback].map((p) => p.name)),
      ];
    } else {
      this._lastEnginesUsed = [...new Set(tier0.map((p) => p.name))];
    }

    return this.deduplicate(tier0Results);
  }

  private async raceProviders(
    providers: SearchProvider[],
    query: string,
    maxResults: number,
    options?: DiscoverOptions,
  ): Promise<RawSearchResult[]> {
    if (providers.length === 0) return [];

    const graceMs = options?.graceMs ?? 150;
    const timeoutMs = options?.timeoutMs ?? 5000;
    const allResults: RawSearchResult[] = [];
    const startTime = Date.now();
    let checkThreshold: (() => void) | undefined;

    const providerPromises = providers.map((p) =>
      p
        .search(query, maxResults)
        .then((results) => {
          allResults.push(...results);
          checkThreshold?.();
          return results;
        })
        .catch(() => [] as RawSearchResult[]),
    );

    const allDone = Promise.allSettled(providerPromises);

    await new Promise<void>((resolve) => {
      let settled = false;
      let graceTimer: ReturnType<typeof setTimeout> | undefined;

      const finish = () => {
        if (!settled) {
          settled = true;
          if (graceTimer) clearTimeout(graceTimer);
          clearTimeout(hard);
          resolve();
        }
      };

      const hard = setTimeout(finish, timeoutMs);
      allDone.then(finish);

      checkThreshold = () => {
        if (settled || graceTimer) return;
        if (this.deduplicateCount(allResults) >= maxResults) {
          const elapsed = Date.now() - startTime;
          const effectiveGrace = Math.min(
            graceMs,
            Math.max(timeoutMs - elapsed, 0),
          );
          graceTimer = setTimeout(finish, effectiveGrace);
        }
      };
    });

    return allResults;
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return (
        parsed.protocol +
        "//" +
        parsed.host.toLowerCase() +
        parsed.pathname.replace(/\/+$/, "") +
        parsed.search +
        parsed.hash
      );
    } catch {
      return url.replace(/\/+$/, "");
    }
  }

  private deduplicateCount(results: RawSearchResult[]): number {
    const seen = new Set<string>();
    for (const r of results) {
      seen.add(this.normalizeUrl(r.url));
    }
    return seen.size;
  }

  private deduplicate(results: RawSearchResult[]): RawSearchResult[] {
    const seen = new Map<string, RawSearchResult>();
    for (const r of results) {
      const normalized = this.normalizeUrl(r.url);
      const existing = seen.get(normalized);
      if (existing) {
        // Merge engine info
        if (!existing.engines) existing.engines = [existing.engine];
        if (!existing.engines.includes(r.engine))
          existing.engines.push(r.engine);
      } else {
        seen.set(normalized, { ...r, engines: [r.engine] });
      }
    }
    return [...seen.values()];
  }
}
