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
    this._lastEnginesUsed = [...new Set(available.map((p) => p.name))];
    if (available.length === 0) return [];

    const graceMs = options?.graceMs ?? 500;
    const timeoutMs = options?.timeoutMs ?? 5000;
    const allResults: RawSearchResult[] = [];
    const startTime = Date.now();

    const providerPromises = available.map((p) =>
      p
        .search(query, maxResults)
        .then((results) => {
          allResults.push(...results);
          return results;
        })
        .catch(() => [] as RawSearchResult[]),
    );

    const allDone = Promise.allSettled(providerPromises);

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          clearInterval(poll);
          clearTimeout(hard);
          resolve();
        }
      };

      const hard = setTimeout(finish, timeoutMs);

      allDone.then(finish);

      const poll = setInterval(() => {
        if (this.deduplicateCount(allResults) >= maxResults) {
          clearInterval(poll);
          // Grace period, but never exceed hard timeout
          const elapsed = Date.now() - startTime;
          const effectiveGrace = Math.min(
            graceMs,
            Math.max(timeoutMs - elapsed, 0),
          );
          setTimeout(finish, effectiveGrace);
        }
      }, 50);
    });

    return this.deduplicate(allResults);
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
