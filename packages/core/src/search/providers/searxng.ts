import type { SearchProvider } from "../provider.js";
import type { RawSearchResult } from "../../types.js";

const PUBLIC_INSTANCES = [
  "https://search.sapti.me",
  "https://searx.tiekoetter.com",
  "https://search.bus-hit.me",
];

export interface SearXNGConfig {
  instances?: string[];
  baseUrl?: string;
  timeout?: number;
}

export class SearXNGProvider implements SearchProvider {
  readonly name = "searxng";
  readonly tier = 0 as const;
  private instances: string[];
  private timeout: number;

  constructor(config?: string | SearXNGConfig, timeout?: number) {
    if (config === undefined || config === null) {
      this.instances = [...PUBLIC_INSTANCES];
      this.timeout = timeout ?? 8000;
    } else if (typeof config === "string") {
      this.instances = [config];
      this.timeout = timeout ?? 8000;
    } else {
      if (config.instances && config.instances.length > 0) {
        this.instances = [...config.instances];
      } else if (config.baseUrl) {
        this.instances = [config.baseUrl];
      } else {
        this.instances = [...PUBLIC_INSTANCES];
      }
      this.timeout = config.timeout ?? timeout ?? 8000;
    }
  }

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, maxResults = 10): Promise<RawSearchResult[]> {
    if (this.instances.length === 1) {
      return this.searchInstance(this.instances[0], query, maxResults);
    }
    return this.raceInstances(query, maxResults);
  }

  private async raceInstances(
    query: string,
    maxResults: number,
  ): Promise<RawSearchResult[]> {
    // Race: resolve as soon as ANY instance returns non-empty results
    try {
      return await Promise.any(
        this.instances.map((instance) =>
          this.searchInstance(instance, query, maxResults).then((results) => {
            if (results.length === 0) throw new Error("empty");
            return results;
          }),
        ),
      );
    } catch {
      // All instances failed or returned empty
      return [];
    }
  }

  private async searchInstance(
    baseUrl: string,
    query: string,
    maxResults: number,
  ): Promise<RawSearchResult[]> {
    const encoded = encodeURIComponent(query).replace(/%20/g, "+");
    const url = `${baseUrl}/search?q=${encoded}&format=json&limit=${maxResults}`;

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
