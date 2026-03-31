import type { SecurityReport } from "../types.js";
import { PI_PATTERNS, MALICIOUS_PATTERNS } from "./patterns.js";

export class InputGuard {
  validate(query: string): SecurityReport {
    const warnings: string[] = [];

    // Sanitize first so HTML tags cannot break PI pattern matching
    // e.g. "ignore <b>previous</b> instructions" → "ignore previous instructions"
    const sanitizedQuery = this.sanitize(query);

    for (const { pattern, description, severity } of PI_PATTERNS) {
      if (pattern.test(sanitizedQuery)) {
        if (severity === "block") {
          return {
            blocked: true,
            reason: `prompt injection detected: ${description}`,
            warnings: [],
          };
        }
        warnings.push(description);
      }
    }

    for (const { pattern, description } of MALICIOUS_PATTERNS) {
      if (pattern.test(sanitizedQuery)) {
        return {
          blocked: true,
          reason: `malicious intent detected: ${description}`,
          warnings: [],
        };
      }
    }

    return {
      blocked: false,
      sanitizedQuery,
      warnings,
    };
  }

  private sanitize(query: string): string {
    return query
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}
