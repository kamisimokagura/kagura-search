export type TrustLevel = "verified" | "unverified" | "conflicted";

export type Platform =
  | "web"
  | "twitter"
  | "reddit"
  | "youtube"
  | "instagram"
  | "tiktok"
  | "github";

export interface SearchResult {
  title: string;
  source: string;
  content: string;
  trust: TrustLevel;
  score: number;
  matchedSources: number;
  platform?: Platform;
  timestamp?: string;
}

export interface SearchMeta {
  engines: string[];
  totalResults: number;
  conflicts: number;
  searchTimeMs: number;
}

export interface KaguraResponse {
  query: string;
  results: SearchResult[];
  meta: SearchMeta;
}

export interface SearchProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  enabled?: boolean;
}

export interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
}

export interface KaguraConfig {
  providers: Record<string, SearchProviderConfig>;
  ai?: AIConfig;
  deep?: boolean;
  maxResults?: number;
  timeout?: number;
}

export interface SearchQuery {
  text: string;
  platform?: Platform;
  deep?: boolean;
  maxResults?: number;
}

export interface RawSearchResult {
  title: string;
  url: string;
  snippet: string;
  engine: string;
}

export interface SecurityReport {
  blocked: boolean;
  reason?: string;
  sanitizedQuery?: string;
  warnings: string[];
}
