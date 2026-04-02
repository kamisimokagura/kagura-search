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
    const searxngOk =
      searxngCfg?.enabled !== false &&
      (searxngCfg as Record<string, unknown> | undefined)?._envBaseUrlFailed !==
        true;
    if (searxngOk) {
      providers.push(new SearXNGProvider(searxngCfg?.baseUrl, timeout));
    }

    const ddgCfg = cfg.duckduckgo;
    // If SearXNG's env: baseUrl was configured but unresolved, also suppress
    // DuckDuckGo to fail closed — the user intended a private SearXNG instance,
    // so silently falling back to a public engine would leak queries.
    // This does NOT trigger for manual `enabled: false` (intentional disable).
    const searxngEnvFailed =
      searxngCfg !== undefined &&
      (searxngCfg as Record<string, unknown>)._envBaseUrlFailed === true;
    const ddgExplicitlyEnabled = ddgCfg?.enabled === true;
    if (
      ddgCfg?.enabled !== false &&
      (!searxngEnvFailed || ddgExplicitlyEnabled)
    ) {
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
    const rawMax = options?.maxResults ?? this.config.maxResults ?? 10;
    const maxResults =
      Number.isFinite(rawMax) && rawMax >= 1 ? Math.floor(rawMax) : 10;
    const isDeep = options?.deep ?? this.config.deep;
    const discoverCount = isDeep ? maxResults * 2 : maxResults;

    // Apply platform site: prefix to narrow search scope (skip for "web" or unknown)
    const platform = options?.platform;
    const platformDomain = platform ? this.platformSite(platform) : "";
    const searchQuery = platformDomain
      ? `${sanitized} site:${platformDomain}`
      : sanitized;

    const raw = await this.searchEngine.discover(searchQuery, discoverCount);
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
    const rawMax = this.config.maxResults ?? 10;
    const maxResults =
      Number.isFinite(rawMax) && rawMax >= 1 ? Math.floor(rawMax) : 10;
    // sources controls verification threshold; default 2 consistent with search()
    // Clamp to at least 2 so "verified" always means 2+ independent sources
    const minSources = Math.max(2, sources ?? 2);
    const discoverCount = Math.max(maxResults, minSources) * 3;

    const raw = await this.searchEngine.discover(sanitized, discoverCount);
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
    const rawCount = maxResults ?? this.config.maxResults ?? 10;
    const count =
      Number.isFinite(rawCount) && rawCount >= 1 ? Math.floor(rawCount) : 10;
    const raw = await this.searchEngine.discover(sanitized, count);
    // Sanitize discover results through OutputShield to strip PI and block
    // private/internal URLs, matching the security guarantees of search()/verify()
    const shielded = this.outputShield.protect(
      raw.map((r) => ({
        title: r.title,
        source: r.url,
        content: r.snippet,
        trust: "unverified" as const,
        score: 0,
        matchedSources: 0,
      })),
    );
    return shielded
      .map((s) => ({
        title: s.title,
        url: s.source,
        snippet: s.content,
        engine: raw.find((r) => r.url === s.source)?.engine ?? "unknown",
      }))
      .slice(0, count);
  }

  private platformSite(platform: string): string {
    const map: Record<string, string> = {
      twitter: "x.com",
      reddit: "reddit.com",
      youtube: "youtube.com",
      instagram: "instagram.com",
      tiktok: "tiktok.com",
      github: "github.com",
    };
    return map[platform] ?? "";
  }
}
