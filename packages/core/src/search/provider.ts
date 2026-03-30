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
