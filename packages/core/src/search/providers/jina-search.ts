import type { SearchProvider } from "../provider.js";
import { RateLimitBreaker } from "../provider.js";
import type { RawSearchResult } from "../../types.js";

/**
 * Jina Search API provider (s.jina.ai).
 * Tier 1 fallback — free, no API key needed, but slower than tier 0.
 * Returns JSON results when Accept: application/json is set.
 */
export class JinaSearchProvider implements SearchProvider {
  readonly name = "jina";
  readonly tier = 1 as const;
  private timeout: number;
  private breaker = new RateLimitBreaker();

  constructor(timeout?: number) {
    this.timeout = timeout ?? 5000;
  }

  isAvailable(): boolean {
    return !this.breaker.isOpen;
  }

  async search(query: string, maxResults = 10): Promise<RawSearchResult[]> {
    const encoded = encodeURIComponent(query);
    const url = `https://s.jina.ai/${encoded}`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Retain-Images": "none",
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        if (response.status === 429 || response.status === 403) {
          this.breaker.trip();
        }
        return [];
      }

      this.breaker.reset();
      const data = (await response.json()) as {
        data?: Array<{
          title?: string;
          url?: string;
          description?: string;
          content?: string;
        }>;
      };

      return (data.data ?? [])
        .filter((r) => r.url && r.title)
        .slice(0, maxResults)
        .map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: r.description ?? r.content?.slice(0, 200) ?? "",
          engine: "jina",
        }));
    } catch {
      return [];
    }
  }
}
