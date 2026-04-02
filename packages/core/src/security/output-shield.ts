import type { SearchResult } from "../types.js";
import { PI_PATTERNS } from "./patterns.js";
import { InputGuard } from "./input-guard.js";

const MAX_CONTENT_LENGTH = 50000;

export class OutputShield {
  private guard = new InputGuard();

  protect(results: SearchResult[]): SearchResult[] {
    return results
      .filter((r) => this.hasValidSource(r))
      .map((r) => this.sanitizeResult(r));
  }

  private hasValidSource(result: SearchResult): boolean {
    // Use the same SSRF-aware validation as InputGuard to prevent
    // surfacing internal/private URLs from untrusted providers
    const check = this.guard.validateUrl(result.source);
    return !check.blocked;
  }

  private sanitizeResult(result: SearchResult): SearchResult {
    return {
      ...result,
      content: this.sanitizeContent(result.content),
      title: this.sanitizeContent(result.title),
    };
  }

  private sanitizeContent(content: string): string {
    // Truncate before regex processing to prevent ReDoS on huge inputs
    const wasTruncated = content.length > MAX_CONTENT_LENGTH;
    let cleaned = wasTruncated ? content.slice(0, MAX_CONTENT_LENGTH) : content;

    cleaned = this.stripZeroWidth(cleaned);

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
    if (wasTruncated) {
      cleaned += "\n\n[content truncated — original exceeded 50KB]";
    }
    return cleaned;
  }

  private stripZeroWidth(text: string): string {
    return text.replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060\u180E]/g, "");
  }
}
