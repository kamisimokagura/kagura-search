import type { SearchProvider } from "./provider.js";
import type { RawSearchResult } from "../types.js";

export interface DiscoverOptions {
  graceMs?: number; // Grace period after first provider returns enough results (default 500)
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
    this._lastEnginesUsed = available.map((p) => p.name);
    if (available.length === 0) return [];

    const graceMs = options?.graceMs ?? 500;
    const timeoutMs = options?.timeoutMs ?? 5000;
    const allResults: RawSearchResult[] = [];
    let firstBatchDone = false;

    // Wrap each provider to collect results as they arrive
    const providerPromises = available.map((p) =>
      p
        .search(query, maxResults)
        .then((results) => {
          allResults.push(...results);
          if (!firstBatchDone && allResults.length >= maxResults) {
            firstBatchDone = true;
          }
          return results;
        })
        .catch(() => [] as RawSearchResult[]),
    );

    // Race: wait for all providers to finish OR timeout/grace period
    await Promise.race([
      Promise.allSettled(providerPromises),
      new Promise<void>((resolve) => {
        // Hard timeout
        const hardTimer = setTimeout(resolve, timeoutMs);
        // Poll to detect when grace period should start
        const checkGrace = setInterval(() => {
          if (firstBatchDone) {
            clearInterval(checkGrace);
            clearTimeout(hardTimer);
            setTimeout(resolve, graceMs);
          }
        }, 50);
        // Clean up interval on hard timeout
        setTimeout(() => clearInterval(checkGrace), timeoutMs);
      }),
    ]);

    return this.deduplicate(allResults);
  }

  private deduplicate(results: RawSearchResult[]): RawSearchResult[] {
    const seen = new Set<string>();
    return results.filter((r) => {
      // Only normalize the hostname case-insensitively; preserve path case
      // so that /API and /api are not collapsed into one result
      try {
        const url = new URL(r.url);
        const normalized =
          url.protocol +
          "//" +
          url.host.toLowerCase() +
          url.pathname.replace(/\/+$/, "") +
          url.search +
          url.hash;
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      } catch {
        // If URL parsing fails, use raw string with trailing slash stripped
        const raw = r.url.replace(/\/+$/, "");
        if (seen.has(raw)) return false;
        seen.add(raw);
        return true;
      }
    });
  }
}
