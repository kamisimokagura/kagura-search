import type { RawSearchResult } from "../types.js";

export interface SearchProvider {
  readonly name: string;
  readonly tier: 0 | 1 | 2;
  isAvailable(): boolean;
  search(query: string, maxResults?: number): Promise<RawSearchResult[]>;
}

export interface ContentExtractor {
  readonly name: string;
  extract(url: string): Promise<string | null>;
}

/**
 * Circuit breaker for rate-limited providers.
 * Tracks 429/403 responses and temporarily disables the provider
 * with exponential backoff (30s → 60s → 120s → max 300s).
 */
export class RateLimitBreaker {
  private cooldownUntil = 0;
  private consecutiveFailures = 0;

  /** Mark a rate-limit hit. Provider becomes unavailable for a cooldown period. */
  trip(): void {
    this.consecutiveFailures++;
    const backoffMs = Math.min(
      30_000 * 2 ** (this.consecutiveFailures - 1),
      300_000,
    );
    this.cooldownUntil = Date.now() + backoffMs;
  }

  /** Reset after a successful request. */
  reset(): void {
    this.consecutiveFailures = 0;
    this.cooldownUntil = 0;
  }

  /** Whether the provider is currently in cooldown. */
  get isOpen(): boolean {
    return Date.now() < this.cooldownUntil;
  }
}
