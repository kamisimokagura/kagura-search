import type { SearchProvider } from "../provider.js";
import type { RawSearchResult } from "../../types.js";

export class BraveAPIProvider implements SearchProvider {
  // Use "brave" (not "brave-api") so HTML and API providers share the same
  // engine identity for deduplication and verification scoring.
  readonly name = "brave";
  readonly tier = 0 as const;
  private apiKey: string | undefined;
  private timeout: number;

  constructor(apiKey?: string, timeout?: number) {
    this.apiKey = apiKey;
    this.timeout = timeout ?? 8000;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async search(query: string, maxResults = 10): Promise<RawSearchResult[]> {
    if (!this.apiKey) return [];

    const encoded = encodeURIComponent(query);
    const count = Math.min(maxResults, 20);
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encoded}&count=${count}`;

    try {
      const response = await fetch(url, {
        headers: {
          "X-Subscription-Token": this.apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) return [];

      const data = (await response.json()) as {
        web?: {
          results?: Array<{
            title?: string;
            url?: string;
            description?: string;
          }>;
        };
      };

      return (data.web?.results ?? [])
        .filter((r) => r.url && r.title)
        .map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: r.description ?? "",
          engine: "brave",
        }));
    } catch {
      return [];
    }
  }
}
