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

    // Extract all link positions and snippet positions, then pair each link
    // with the nearest snippet that appears BEFORE the next link.
    const linkRegex =
      /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    const links: { url: string; title: string; index: number }[] = [];
    for (const m of html.matchAll(linkRegex)) {
      links.push({
        url: this.decodeUrl(m[1]),
        title: this.stripHtml(m[2]),
        index: m.index!,
      });
    }

    const snippets: { text: string; index: number }[] = [];
    for (const m of html.matchAll(snippetRegex)) {
      snippets.push({ text: this.stripHtml(m[1]), index: m.index! });
    }

    // For each link, find the first snippet that comes after it but before the
    // next link. This ensures snippets are only paired with their own result.
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const nextLinkIndex =
        i + 1 < links.length ? links[i + 1].index : Infinity;

      const ownSnippet = snippets.find(
        (s) => s.index > link.index && s.index < nextLinkIndex,
      );

      if (link.url && link.title) {
        results.push({
          title: link.title,
          url: link.url,
          snippet: ownSnippet?.text ?? "",
          engine: "duckduckgo",
        });
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
