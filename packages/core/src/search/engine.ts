import type { SearchProvider } from "./provider.js";
import type { RawSearchResult } from "../types.js";

export class SearchEngine {
  private providers: SearchProvider[];
  private _lastEnginesUsed: string[] = [];

  constructor(providers: SearchProvider[]) {
    this.providers = providers.sort((a, b) => a.tier - b.tier);
  }

  get lastEnginesUsed(): string[] {
    return [...this._lastEnginesUsed];
  }

  async discover(query: string, maxResults = 10): Promise<RawSearchResult[]> {
    const available = this.providers.filter((p) => p.isAvailable());
    this._lastEnginesUsed = available.map((p) => p.name);

    const settled = await Promise.allSettled(
      available.map((p) => p.search(query, maxResults)),
    );

    const allResults: RawSearchResult[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        allResults.push(...result.value);
      }
    }

    // Don't truncate here — let verification see the full multi-engine result set.
    // The caller (KaguraSearch) handles final maxResults slicing after verification.
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
