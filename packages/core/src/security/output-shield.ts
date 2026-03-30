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
      title: this.stripZeroWidth(result.title),
    };
  }

  private sanitizeContent(content: string): string {
    let cleaned = this.stripZeroWidth(content);

    for (const { pattern } of PI_PATTERNS) {
      cleaned = cleaned.replace(pattern, "[removed]");
    }

    cleaned = cleaned.replace(/\[removed\]\s*/g, "").trim();
    return cleaned;
  }

  private stripZeroWidth(text: string): string {
    return text.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, "");
  }
}
