import type { SearchResult } from "../types.js";
import { PI_PATTERNS, SECRET_PATTERNS } from "./patterns.js";
import { InputGuard } from "./input-guard.js";

// Display-length cap: secrets are redacted from the FULL content first (all
// patterns are bounded/linear, so no ReDoS), then the already-cleaned text is
// trimmed for display. Trimming after redaction avoids splitting a secret across
// the boundary.
const MAX_CONTENT_LENGTH = 50_000;
// Hard availability cap: oversized input is not scanned (fail closed) to bound
// processing cost on hostile/abnormal provider results.
const HARD_CAP = 200_000;

// Patterns whose matches are stripped from surfaced content: prompt-injection
// attempts (PI_PATTERNS) and leaked secrets/credentials (SECRET_PATTERNS).
const SHIELD_PATTERNS = [...PI_PATTERNS, ...SECRET_PATTERNS];

export class OutputShield {
  private guard = new InputGuard();

  protect(results: SearchResult[]): SearchResult[] {
    return results
      .filter((r) => this.hasValidSource(r))
      // Surface URLs must not carry credentials. Structural parse (URL.userinfo)
      // closes variants the regex misses (empty user/pass, user-only, colons in
      // password); the sanitize-equality backstop catches any remaining alteration.
      // A result whose source carries credentials is dropped (fail closed).
      .filter((r) => this.sourceHasNoSecret(r))
      .map((r) => this.sanitizeResult(r));
  }

  private sourceHasNoSecret(result: SearchResult): boolean {
    try {
      const url = new URL(result.source);
      if (url.username !== "" || url.password !== "") return false;
    } catch {
      // Not a parseable URL; fall through to the sanitize-equality backstop.
    }
    return this.sanitizeContent(result.source) === result.source;
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
    // Fail closed on oversized input (availability bound). Secrets in such input
    // are not surfaced rather than partially scanned.
    if (content.length > HARD_CAP) {
      return "";
    }
    // Redact secrets from the full content first (linear/bounded patterns), then
    // trim for display — so a long result is never split mid-secret.
    const wasTruncated = content.length > MAX_CONTENT_LENGTH;
    let cleaned = content;

    cleaned = this.stripZeroWidth(cleaned);
    // Redact PEM/PGP/encrypted private-key blocks with a single-pass linear
    // scanner (not a cross-document regex) so a block with no END marker — or a
    // split one — is still fully removed (fail-closed to EOF).
    cleaned = this.stripPrivateKeyBlocks(cleaned);

    // Apply all block-severity patterns repeatedly. Re-scanning after each replacement
    // lets one redaction expose another (e.g. removing a secret can reveal a
    // prompt-injection phrase that was previously broken up). Matches are replaced with
    // nothing — never with an attacker-reproducible sentinel such as "[removed]", which
    // could itself be planted to reassemble an injection after the marker is stripped.
    let prev = cleaned;
    let iterations = 0;
    do {
      prev = cleaned;
      for (const { pattern, severity } of SHIELD_PATTERNS) {
        // Only strip patterns with "block" severity — warn patterns (e.g. SQL keywords)
        // are legitimate content that should not be removed from search results
        if (severity !== "block") continue;
        const globalPattern = new RegExp(
          pattern.source,
          pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
        );
        cleaned = cleaned.replace(globalPattern, "");
      }
      // Re-scan for PEM/PGP blocks after regex replacements: a redaction (e.g. an
      // AWS key embedded in a "-----BEGIN <...> PRIVATE KEY-----" label) can
      // reassemble a private-key opener that the pre-loop scan already passed.
      cleaned = this.stripPrivateKeyBlocks(cleaned);
      iterations++;
    } while (cleaned !== prev && iterations < 20);

    // Fail closed: if we exhausted the pass budget while content was still
    // changing, a nested redaction-evasion (e.g. layered "ignore X previous
    // instructions") may remain. Surface nothing rather than potentially
    // injected content.
    if (cleaned !== prev) {
      cleaned = "";
    }

    // Trim the already-redacted text to the display cap (secrets are gone, so
    // this cannot split a secret across the boundary). Reserve space for the
    // truncation notice so the final returned length stays within the cap.
    if (cleaned.length > MAX_CONTENT_LENGTH) {
      const notice = `\n\n[content truncated — original exceeded ${MAX_CONTENT_LENGTH} characters; secrets redacted in full]`;
      cleaned = cleaned.slice(0, Math.max(0, MAX_CONTENT_LENGTH - notice.length)).trimEnd();
      cleaned += notice;
    } else {
      cleaned = cleaned.trim();
    }
    return cleaned;
  }

  private stripZeroWidth(text: string): string {
    return text.replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060\u180E]/g, "");
  }

  // Single-pass linear scanner for PEM/PGP/encrypted private-key blocks.
  // Captures the exact opener label (e.g. "RSA PRIVATE KEY", "OPENSSH PRIVATE
  // KEY", "PGP PRIVATE KEY BLOCK") and removes through the matching
  // "-----END <label>-----". A block with no matching END marker (unterminated
  // or split) is redacted through EOF (fail-closed). A monotonic cursor and a
  // single concatenation make this O(n) regardless of block count.
  private stripPrivateKeyBlocks(text: string): string {
    const BEGIN = "-----BEGIN ";
    const DASHES = "-----";
    const parts: string[] = [];
    let cursor = 0;
    let searchFrom = 0;
    for (;;) {
      const beginIdx = text.indexOf(BEGIN, searchFrom);
      if (beginIdx === -1) break;
      const labelStart = beginIdx + BEGIN.length;
      const labelEnd = text.indexOf(DASHES, labelStart);
      if (labelEnd === -1) {
        searchFrom = labelStart;
        continue;
      }
      const label = text.slice(labelStart, labelEnd);
      const isPrivateKey = label.endsWith("PRIVATE KEY") || label === "PGP PRIVATE KEY BLOCK";
      if (!isPrivateKey) {
        searchFrom = labelEnd;
        continue;
      }
      const endMarker = `${BEGIN.replace("BEGIN ", "END ")}${label}${DASHES}`;
      const endIdx = text.indexOf(endMarker, labelEnd);
      if (endIdx === -1) {
        // Unterminated block → fail closed to EOF.
        parts.push(text.slice(cursor, beginIdx));
        cursor = text.length;
        break;
      }
      parts.push(text.slice(cursor, beginIdx));
      cursor = endIdx + endMarker.length;
      searchFrom = cursor;
    }
    parts.push(text.slice(cursor));
    return parts.join("");
  }
}
