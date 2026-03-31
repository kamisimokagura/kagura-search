import type { SearchResult } from "../types.js";
import { PI_PATTERNS } from "./patterns.js";

export class OutputShield {
  protect(results: SearchResult[]): SearchResult[] {
    return results
      .filter((r) => this.hasValidSource(r))
      .map((r) => this.sanitizeResult(r));
  }

  private hasValidSource(result: SearchResult): boolean {
    return result.source.length > 0 && /^https?:\/\//.test(result.source);
  }

  private sanitizeResult(result: SearchResult): SearchResult {
    return {
      ...result,
      content: this.sanitizeContent(result.content),
      title: this.sanitizeContent(result.title),
    };
  }

  private sanitizeContent(content: string): string {
    let cleaned = this.stripZeroWidth(content);

    for (const { pattern, severity } of PI_PATTERNS) {
      // Only strip patterns with "block" severity — warn patterns (e.g. SQL keywords)
      // are legitimate content that should not be removed from search results
      if (severity !== "block") continue;
      const globalPattern = new RegExp(
        pattern.source,
        pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
      );
      cleaned = cleaned.replace(globalPattern, "[removed]");
    }

    cleaned = cleaned.replace(/\[removed\]\s*/g, "").trim();
    return cleaned;
  }

  private stripZeroWidth(text: string): string {
    return text.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, "");
  }
}
