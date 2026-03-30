import type { SecurityReport } from "../types.js";
import { PI_PATTERNS, MALICIOUS_PATTERNS } from "./patterns.js";

export class InputGuard {
  validate(query: string): SecurityReport {
    const warnings: string[] = [];

    for (const { pattern, description, severity } of PI_PATTERNS) {
      if (pattern.test(query)) {
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
      if (pattern.test(query)) {
        return {
          blocked: true,
          reason: `malicious intent detected: ${description}`,
          warnings: [],
        };
      }
    }

    const sanitizedQuery = this.sanitize(query);

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
