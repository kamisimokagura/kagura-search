import type { SearchProvider } from "../provider.js";
import { RateLimitBreaker } from "../provider.js";
import type { RawSearchResult } from "../../types.js";

export class DuckDuckGoProvider implements SearchProvider {
  readonly name = "duckduckgo";
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
    const jsonResults = await this.searchJson(query, maxResults);
    if (jsonResults.length > 0) return jsonResults;
    return this.searchHtml(query, maxResults);
  }

  private async searchJson(
    query: string,
    maxResults: number,
  ): Promise<RawSearchResult[]> {
    try {
      const encoded = encodeURIComponent(query).replace(/%20/g, "+");

      // Step 1: fetch the main page to extract vqd token
      // Use a realistic User-Agent and force English locale to avoid
      // localized error pages (e.g. Chinese block pages)
      const pageResponse = await fetch(
        `https://duckduckgo.com/?q=${encoded}&kl=wt-wt`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Accept: "text/html",
            "Accept-Language": "en-US,en;q=0.9",
          },
          signal: AbortSignal.timeout(this.timeout),
        },
      );

      if (!pageResponse.ok) {
        if (pageResponse.status === 429 || pageResponse.status === 403) {
          this.breaker.trip();
        }
        return [];
      }

      const pageHtml = await pageResponse.text();
      const vqd = this.extractVqd(pageHtml);
      if (!vqd) return [];

      // Step 2: fetch d.js JSONP endpoint with vqd token
      const djsUrl =
        `https://links.duckduckgo.com/d.js?q=${encoded}` +
        `&vqd=${encodeURIComponent(vqd)}&kl=wt-wt&l=wt-wt&p=&s=0&df=&ex=-1`;

      const djsResponse = await fetch(djsUrl, {
        headers: {
          "User-Agent": "KaguraSearch/1.0",
          Accept: "*/*",
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!djsResponse.ok) return [];

      const jsonp = await djsResponse.text();
      return this.parseJsonp(jsonp).slice(0, maxResults);
    } catch {
      return [];
    }
  }

  private async searchHtml(
    query: string,
    maxResults: number,
  ): Promise<RawSearchResult[]> {
    const encoded = encodeURIComponent(query).replace(/%20/g, "+");
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html",
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
      return this.parseHtmlResults(html).slice(0, maxResults);
    } catch {
      return [];
    }
  }

  private extractVqd(html: string): string | null {
    // Try multiple patterns — DDG uses different formats across page versions
    const patterns = [
      /vqd=["']([^"']+)["']/,
      /vqd=([\d]+-[\d]+(?:-[\d]+)*)/,
      /"vqd":"([^"]+)"/,
      /vqd%3D([^&"']+)/,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  private parseJsonp(jsonp: string): RawSearchResult[] {
    try {
      const match = jsonp.match(
        /DDG\.pageLayout\.load\(\s*'d'\s*,\s*(\[[\s\S]*?\])\s*\)/,
      );
      if (!match) return [];

      const items = JSON.parse(match[1]) as Array<{
        t?: string;
        u?: string;
        a?: string;
      }>;

      const results: RawSearchResult[] = [];
      for (const item of items) {
        if (item.t && item.u) {
          results.push({
            title: this.stripHtml(item.t),
            url: item.u,
            snippet: this.stripHtml(item.a ?? ""),
            engine: "duckduckgo",
          });
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  private parseHtmlResults(html: string): RawSearchResult[] {
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
