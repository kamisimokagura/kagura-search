import type { SearchProvider } from "../provider.js";
import { RateLimitBreaker } from "../provider.js";
import type { RawSearchResult } from "../../types.js";

export class GoogleHTMLProvider implements SearchProvider {
  readonly name = "google";
  readonly tier = 0 as const;
  private timeout: number;
  private breaker = new RateLimitBreaker();

  constructor(timeout?: number) {
    this.timeout = timeout ?? 8000;
  }

  isAvailable(): boolean {
    return !this.breaker.isOpen;
  }

  async search(query: string, maxResults = 10): Promise<RawSearchResult[]> {
    const encoded = encodeURIComponent(query).replace(/%20/g, "+");
    const num = Math.min(maxResults, 10);
    const url = `https://www.google.com/search?q=${encoded}&num=${num}&hl=en`;

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

    // Google wraps each organic result in a <div class="g"> or similar.
    // Strategy: find all <a href="..."> that point to external sites,
    // paired with an <h3> title and a snippet <span>.

    // Approach 1: Match <a href="/url?q=..." > <h3>title</h3> </a> ... snippet
    const linkRegex =
      /<a[^>]*href="\/url\?q=([^&"]+)[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g;

    for (const match of html.matchAll(linkRegex)) {
      const rawUrl = decodeURIComponent(match[1]);
      const title = this.stripHtml(match[2]);

      if (!rawUrl.startsWith("http") || !title) continue;

      // Find snippet near this result (look for nearby <span> or <div> with description text)
      const afterMatch = html.slice(
        match.index! + match[0].length,
        match.index! + match[0].length + 2000,
      );
      const snippetMatch = afterMatch.match(
        /<(?:span|div)[^>]*class="[^"]*(?:VwiC3b|IsZvec|s3v9rd)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/,
      );
      const snippet = snippetMatch ? this.stripHtml(snippetMatch[1]) : "";

      results.push({
        title,
        url: rawUrl,
        snippet,
        engine: "google",
      });
    }

    // Approach 2 fallback: simpler pattern for <a href="https://..."><h3>
    if (results.length === 0) {
      const simpleRegex =
        /<a[^>]*href="(https?:\/\/(?!www\.google\.com)[^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g;

      for (const match of html.matchAll(simpleRegex)) {
        const url = match[1];
        const title = this.stripHtml(match[2]);
        if (url && title) {
          results.push({ title, url, snippet: "", engine: "google" });
        }
      }
    }

    return results;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}
