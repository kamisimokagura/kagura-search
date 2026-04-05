import type { SearchProvider } from "../provider.js";
import { RateLimitBreaker } from "../provider.js";
import type { RawSearchResult } from "../../types.js";

export class BraveHTMLProvider implements SearchProvider {
  readonly name = "brave";
  readonly tier = 0 as const;
  private timeout: number;
  private breaker = new RateLimitBreaker();

  constructor(timeout?: number) {
    this.timeout = timeout ?? 5000;
  }

  isAvailable(): boolean {
    return !this.breaker.isOpen;
  }

  async search(query: string, maxResults = 10): Promise<RawSearchResult[]> {
    const encoded = encodeURIComponent(query).replace(/%20/g, "+");
    const url = `https://search.brave.com/search?q=${encoded}&source=web`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
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
      const html = await response.text();
      return this.parseResults(html).slice(0, maxResults);
    } catch {
      return [];
    }
  }

  private parseResults(html: string): RawSearchResult[] {
    const results: RawSearchResult[] = [];

    // Primary approach: pair snippet-title links with snippet-description by position.
    // Works for both flat and nested Brave HTML structures.
    const titleRegex =
      /class="snippet-title"[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    const descRegex =
      /class="snippet-description"[^>]*>([\s\S]*?)<\/(?:div|p)>/g;

    const links: { url: string; title: string; index: number }[] = [];
    for (const m of html.matchAll(titleRegex)) {
      links.push({
        url: this.decodeEntities(m[1]),
        title: this.stripHtml(m[2]),
        index: m.index!,
      });
    }

    const descs: { text: string; index: number }[] = [];
    for (const m of html.matchAll(descRegex)) {
      descs.push({ text: this.stripHtml(m[1]), index: m.index! });
    }

    if (links.length > 0) {
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const nextIndex = i + 1 < links.length ? links[i + 1].index : Infinity;
        const desc = descs.find(
          (d) => d.index > link.index && d.index < nextIndex,
        );
        if (link.url && link.title) {
          results.push({
            title: link.title,
            url: link.url,
            snippet: desc?.text ?? "",
            engine: "brave",
          });
        }
      }
      return results;
    }

    // Fallback: search inside data-type="web" snippet blocks for any link + description.
    // Handles cases where Brave uses different class names for titles.
    const snippetRegex =
      /<div[^>]+data-type="web"[^>]*>([\s\S]*?)(?=<div[^>]+data-type="|$)/g;

    for (const block of html.matchAll(snippetRegex)) {
      const content = block[1];
      const linkMatch = content.match(
        /<a[^>]*href="(https?:[^"]*)"[^>]*>([\s\S]*?)<\/a>/,
      );
      if (!linkMatch) continue;

      const url = this.decodeEntities(linkMatch[1]);
      const title = this.stripHtml(linkMatch[2]);
      const descMatch = content.match(
        /class="[^"]*(?:snippet-description|description)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|p)>/,
      );
      const snippet = descMatch ? this.stripHtml(descMatch[1]) : "";

      if (url && title) {
        results.push({ title, url, snippet, engine: "brave" });
      }
    }

    return results;
  }

  private decodeEntities(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}
