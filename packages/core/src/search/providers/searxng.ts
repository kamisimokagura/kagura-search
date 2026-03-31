import type { SearchProvider } from "../provider.js";
import type { RawSearchResult } from "../../types.js";

const PUBLIC_INSTANCES = [
  "https://search.sapti.me",
  "https://searx.tiekoetter.com",
  "https://search.bus-hit.me",
];

export class SearXNGProvider implements SearchProvider {
  readonly name = "searxng";
  readonly tier = 0 as const;
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl?: string, timeout?: number) {
    this.baseUrl = baseUrl ?? PUBLIC_INSTANCES[0];
    this.timeout = timeout ?? 8000;
  }

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, maxResults = 10): Promise<RawSearchResult[]> {
    const encoded = encodeURIComponent(query).replace(/%20/g, "+");
    const url = `${this.baseUrl}/search?q=${encoded}&format=json&limit=${maxResults}`;

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) return [];

      const data = await response.json();
      return (data.results ?? []).map(
        (r: {
          title: string;
          url: string;
          content: string;
          engine: string;
        }) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: r.content ?? "",
          engine: r.engine ?? "searxng",
        }),
      );
    } catch {
      return [];
    }
  }
}
