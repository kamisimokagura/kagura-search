import type { SecurityReport } from "../types.js";
import { PI_PATTERNS, MALICIOUS_PATTERNS } from "./patterns.js";

const MAX_QUERY_LENGTH = 2000;

export class InputGuard {
  validate(query: string): SecurityReport {
    if (query.length > MAX_QUERY_LENGTH) {
      return {
        blocked: true,
        reason: `query too long: ${query.length} chars (max ${MAX_QUERY_LENGTH})`,
        warnings: [],
      };
    }

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

  validateUrl(url: string): SecurityReport {
    if (url.length > MAX_QUERY_LENGTH) {
      return {
        blocked: true,
        reason: `URL too long: ${url.length} chars (max ${MAX_QUERY_LENGTH})`,
        warnings: [],
      };
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return {
        blocked: true,
        reason: "invalid URL",
        warnings: [],
      };
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        blocked: true,
        reason: `blocked URL scheme: ${parsed.protocol}`,
        warnings: [],
      };
    }

    const host = parsed.hostname.toLowerCase();

    if (!host) {
      return {
        blocked: true,
        reason: "blocked: empty host",
        warnings: [],
      };
    }

    // Block localhost and all its aliases
    // Normalize trailing dot for DNS root comparison
    const hostNoDot = host.endsWith(".") ? host.slice(0, -1) : host;
    if (
      hostNoDot === "localhost" ||
      hostNoDot.endsWith(".localhost") ||
      this.isDnsRebindingDomain(hostNoDot)
    ) {
      return {
        blocked: true,
        reason: "blocked: localhost",
        warnings: [],
      };
    }

    // Block private/internal IP ranges (SSRF protection)
    // Strip IPv6 brackets for analysis
    const bareHost = host.startsWith("[") ? host.slice(1, -1) : host;

    if (this.isPrivateAddress(bareHost)) {
      return {
        blocked: true,
        reason: "blocked: private/internal IP address",
        warnings: [],
      };
    }

    return { blocked: false, warnings: [] };
  }

  private isPrivateAddress(host: string): boolean {
    // IPv4 private/reserved ranges
    if (
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host === "0.0.0.0" ||
      host.startsWith("169.254.") ||
      host.startsWith("198.18.") ||
      host.startsWith("198.19.")
    ) {
      return true;
    }

    // IPv4 172.16-31.x.x
    const match172 = host.match(/^172\.(\d+)\./);
    if (match172) {
      const second = parseInt(match172[1], 10);
      if (second >= 16 && second <= 31) return true;
    }

    // IPv4 100.64-127.x.x (CGN / Carrier-Grade NAT, RFC 6598)
    const match100 = host.match(/^100\.(\d+)\./);
    if (match100) {
      const second = parseInt(match100[1], 10);
      if (second >= 64 && second <= 127) return true;
    }

    // IPv6-specific checks — only apply to actual IPv6 addresses (contain ':')
    // to avoid false positives on domains like fdroid.org or fc2.com
    if (host.includes(":")) {
      if (
        host === "::1" ||
        host === "::ffff:127.0.0.1" ||
        host.startsWith("::ffff:7f") ||
        host.startsWith("::ffff:10.") ||
        host.startsWith("::ffff:192.168.") ||
        host.startsWith("::ffff:169.254.") ||
        host.startsWith("fc") ||
        host.startsWith("fd") ||
        this.isIPv6LinkLocal(host)
      ) {
        return true;
      }

      // IPv6 mapped IPv4 — handles both dotted-decimal (::ffff:192.168.0.1)
      // and hex-normalized (::ffff:c0a8:1) forms
      if (host.startsWith("::ffff:")) {
        const suffix = host.slice(7);
        if (suffix.includes(".")) {
          // Dotted-decimal form
          return this.isPrivateAddress(suffix);
        }
        // Hex form: convert back to dotted-decimal
        const ipv4 = this.hexIPv6ToIPv4(suffix);
        if (ipv4) return this.isPrivateAddress(ipv4);
      }
    }

    return false;
  }

  /** Check if host is in the fe80::/10 link-local range (fe80 through febf) */
  private isIPv6LinkLocal(host: string): boolean {
    const match = host.match(/^fe([0-9a-f]{2})/i);
    if (!match) return false;
    const secondByte = parseInt(match[1], 16);
    // fe80::/10 means the top 10 bits are 1111111010, so fe80-febf
    return secondByte >= 0x80 && secondByte <= 0xbf;
  }

  /** Convert hex IPv4-mapped IPv6 suffix (e.g. "c0a8:1") to dotted-decimal IPv4 */
  private hexIPv6ToIPv4(hex: string): string | null {
    const parts = hex.split(":");
    if (parts.length !== 2) return null;
    const hi = parseInt(parts[0], 16);
    const lo = parseInt(parts[1], 16);
    if (isNaN(hi) || isNaN(lo)) return null;
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  /** Known DNS rebinding domains that resolve to loopback/private IPs */
  private isDnsRebindingDomain(host: string): boolean {
    const rebindingDomains = [
      "lvh.me",
      "localtest.me",
      "nip.io",
      "sslip.io",
      "xip.io",
      "vcap.me",
      "lacolhost.com",
      "yoogle.com",
    ];
    return rebindingDomains.some((d) => host === d || host.endsWith("." + d));
  }

  private sanitize(query: string): string {
    return query
      .replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060\u180E]/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}
