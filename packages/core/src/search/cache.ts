import type { KaguraResponse } from "../types.js";

interface CacheEntry {
  response: KaguraResponse;
  expiresAt: number;
}

export interface CacheConfig {
  maxEntries?: number;
  ttlMs?: number;
}

export class SearchCache {
  private cache = new Map<string, CacheEntry>();
  private maxEntries: number;
  private ttlMs: number;

  constructor(config?: CacheConfig) {
    this.maxEntries = config?.maxEntries ?? 100;
    this.ttlMs = config?.ttlMs ?? 300_000; // 5 minutes
  }

  private key(query: string, maxResults: number): string {
    return `${query}\0${maxResults}`;
  }

  get(query: string, maxResults: number): KaguraResponse | undefined {
    const k = this.key(query, maxResults);
    const entry = this.cache.get(k);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(k);
      return undefined;
    }
    // Move to end (most recently used)
    this.cache.delete(k);
    this.cache.set(k, entry);
    return entry.response;
  }

  set(query: string, maxResults: number, response: KaguraResponse): void {
    const k = this.key(query, maxResults);
    this.cache.delete(k);
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value!;
      this.cache.delete(oldest);
    }
    this.cache.set(k, { response, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.cache.clear();
  }
}
