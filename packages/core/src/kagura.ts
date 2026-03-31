import type {
  KaguraConfig,
  KaguraResponse,
  RawSearchResult,
  SearchQuery,
} from "./types.js";
import { loadConfig } from "./config.js";
import { InputGuard } from "./security/input-guard.js";
import { OutputShield } from "./security/output-shield.js";
import { SearchEngine } from "./search/engine.js";
import type { SearchProvider } from "./search/provider.js";
import { VerifyEngine } from "./verify/engine.js";
import { SearXNGProvider } from "./search/providers/searxng.js";
import { DuckDuckGoProvider } from "./search/providers/duckduckgo.js";

export class KaguraSearch {
  private config: KaguraConfig;
  private inputGuard: InputGuard;
  private outputShield: OutputShield;
  private searchEngine: SearchEngine;
  private verifyEngine: VerifyEngine;

  constructor(config?: Partial<KaguraConfig>) {
    this.config = loadConfig(config);
    this.inputGuard = new InputGuard();
    this.outputShield = new OutputShield();
    this.verifyEngine = new VerifyEngine();

    const providers = this.buildProviders();
    this.searchEngine = new SearchEngine(providers);
  }

  private buildProviders(): SearchProvider[] {
    const providers: SearchProvider[] = [];
    const cfg = this.config.providers;
    const timeout = this.config.timeout;

    // Only add providers that are not explicitly disabled
    const searxngCfg = cfg.searxng;
    if (searxngCfg?.enabled !== false) {
      providers.push(new SearXNGProvider(searxngCfg?.baseUrl, timeout));
    }

    const ddgCfg = cfg.duckduckgo;
    if (ddgCfg?.enabled !== false) {
      providers.push(new DuckDuckGoProvider(timeout));
    }

    // No fallback: if all providers are explicitly disabled,
    // return empty so searches return no results as expected
    return providers;
  }

  async search(
    query: string,
    options?: Partial<SearchQuery>,
  ): Promise<KaguraResponse> {
    const startTime = Date.now();

    const security = this.inputGuard.validate(query);
    if (security.blocked) {
      return {
        query,
        results: [],
        meta: {
          engines: [],
          totalResults: 0,
          conflicts: 0,
          searchTimeMs: Date.now() - startTime,
        },
      };
    }

    const sanitized = security.sanitizedQuery ?? query;
    const maxResults = options?.maxResults ?? this.config.maxResults ?? 10;
    const isDeep = options?.deep ?? this.config.deep;
    const discoverCount = isDeep ? maxResults * 2 : maxResults;

    const raw = await this.searchEngine.discover(sanitized, discoverCount);
    const verified = this.verifyEngine.verify(raw, sanitized);
    let safe = this.outputShield.protect(verified.results);

    // In deep mode, filter to only verified/conflicted results
    if (isDeep) {
      safe = safe.filter((r) => r.trust !== "unverified");
    }

    // Enforce maxResults after all filtering
    safe = safe.slice(0, maxResults);

    return {
      query,
      results: safe,
      meta: {
        engines: this.searchEngine.lastEnginesUsed,
        totalResults: safe.length,
        conflicts: verified.conflicts,
        searchTimeMs: Date.now() - startTime,
      },
    };
  }

  async verify(claim: string, sources?: number): Promise<KaguraResponse> {
    // verify() uses 2x discovery like deep mode but preserves ALL results
    // including unverified ones, so callers can distinguish "found but not
    // corroborated" from "not found at all"
    const startTime = Date.now();

    const security = this.inputGuard.validate(claim);
    if (security.blocked) {
      return {
        query: claim,
        results: [],
        meta: {
          engines: [],
          totalResults: 0,
          conflicts: 0,
          searchTimeMs: Date.now() - startTime,
        },
      };
    }

    const sanitized = security.sanitizedQuery ?? claim;
    const maxResults = sources ?? this.config.maxResults ?? 10;
    const discoverCount = maxResults * 2;

    const raw = await this.searchEngine.discover(sanitized, discoverCount);
    // Use sources as the minimum independent-source threshold for verification
    const minSources = sources ?? 2;
    const verified = this.verifyEngine.verify(raw, sanitized, minSources);
    const safe = this.outputShield
      .protect(verified.results)
      .slice(0, maxResults);

    return {
      query: claim,
      results: safe,
      meta: {
        engines: this.searchEngine.lastEnginesUsed,
        totalResults: safe.length,
        conflicts: verified.conflicts,
        searchTimeMs: Date.now() - startTime,
      },
    };
  }

  async discover(
    query: string,
    maxResults?: number,
  ): Promise<RawSearchResult[]> {
    const security = this.inputGuard.validate(query);
    if (security.blocked) return [];

    const sanitized = security.sanitizedQuery ?? query;
    const count = maxResults ?? this.config.maxResults ?? 10;
    return this.searchEngine.discover(sanitized, count);
  }
}
