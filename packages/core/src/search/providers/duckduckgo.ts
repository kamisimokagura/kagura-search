import type { SearchProvider } from "../provider.js";
import type { RawSearchResult } from "../../types.js";

export class DuckDuckGoProvider implements SearchProvider {
  readonly name = "duckduckgo";
  readonly tier = 0 as const;
  private timeout: number;

  constructor(timeout?: number) {
    this.timeout = timeout ?? 8000;
  }

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, maxResults = 10): Promise<RawSearchResult[]> {
    const encoded = encodeURIComponent(query).replace(/%20/g, "+");
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "KaguraSearch/1.0",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) return [];

      const html = await response.text();
      return this.parseResults(html).slice(0, maxResults);
    } catch {
      return [];
    }
  }

  private parseResults(html: string): RawSearchResult[] {
    const results: RawSearchResult[] = [];
    const linkRegex =
      /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    const links = [...html.matchAll(linkRegex)];
    const snippets = [...html.matchAll(snippetRegex)];

    for (let i = 0; i < links.length; i++) {
      const url = this.decodeUrl(links[i][1]);
      const title = this.stripHtml(links[i][2]);
      const snippet = i < snippets.length ? this.stripHtml(snippets[i][1]) : "";

      if (url && title) {
        results.push({ title, url, snippet, engine: "duckduckgo" });
      }
    }

    return results;
  }

  private decodeUrl(encoded: string): string {
    try {
      const match = encoded.match(/uddg=([^&]*)/);
      if (match) return decodeURIComponent(match[1]);
      if (encoded.startsWith("http")) return encoded;
      return "";
    } catch {
      return encoded;
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}
