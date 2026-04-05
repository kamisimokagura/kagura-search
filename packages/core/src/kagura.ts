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
import { SearchCache } from "./search/cache.js";
import { BraveHTMLProvider } from "./search/providers/brave-html.js";
import { BraveAPIProvider } from "./search/providers/brave-api.js";
import { GoogleHTMLProvider } from "./search/providers/google.js";
import { JinaSearchProvider } from "./search/providers/jina-search.js";

export class KaguraSearch {
  private config: KaguraConfig;
  private inputGuard: InputGuard;
  private outputShield: OutputShield;
  private searchEngine: SearchEngine;
  private verifyEngine: VerifyEngine;
  private cache: SearchCache;

  constructor(config?: Partial<KaguraConfig>) {
    this.config = loadConfig(config);
    this.inputGuard = new InputGuard();
    this.outputShield = new OutputShield();
    this.verifyEngine = new VerifyEngine();
    this.cache = new SearchCache(this.config.cache);

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
      providers.push(
        new SearXNGProvider({
          instances: searxngCfg?.instances,
          baseUrl: searxngCfg?.baseUrl,
          timeout,
        }),
      );
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

    // Brave HTML scraper — suppress when SearXNG env failed (privacy)
    const braveCfg = cfg.brave;
    const braveExplicitlyEnabled = braveCfg?.enabled === true;
    if (
      braveCfg?.enabled !== false &&
      (!searxngEnvFailed || braveExplicitlyEnabled)
    ) {
      providers.push(new BraveHTMLProvider(timeout));
    }

    // Brave API — also respect enabled:false AND suppress when SearXNG env failed.
    // Only `enabled: true` overrides fail-closed (not mere apiKey presence),
    // because a user may have both SearXNG (private) and Brave API configured
    // and expect ALL providers to stop when their private instance is unavailable.
    const braveApiCfg = cfg["brave-api"];
    const braveApiExplicitlyEnabled = braveApiCfg?.enabled === true;
    if (
      braveApiCfg?.enabled !== false &&
      braveApiCfg?.apiKey &&
      (!searxngEnvFailed || braveApiExplicitlyEnabled)
    ) {
      providers.push(new BraveAPIProvider(braveApiCfg.apiKey, timeout));
    }

    // Google and Jina are new providers. To avoid surprising users who
    // disabled all legacy providers (expecting zero outbound requests),
    // only add them when at least one legacy provider is active OR the user
    // explicitly opted in via `enabled: true`.
    const hasLegacyProvider = providers.length > 0;

    // Google HTML scraper — suppress when SearXNG env failed (privacy)
    const googleCfg = cfg.google;
    const googleExplicitlyEnabled = googleCfg?.enabled === true;
    if (
      googleCfg?.enabled !== false &&
      (hasLegacyProvider || googleExplicitlyEnabled) &&
      (!searxngEnvFailed || googleExplicitlyEnabled)
    ) {
      providers.push(new GoogleHTMLProvider(timeout));
    }

    // Jina Search — opt-in only (enabled: true required).
    // Sends every query to s.jina.ai so it's a privacy-conscious choice.
    const jinaCfg = cfg.jina;
    const jinaExplicitlyEnabled = jinaCfg?.enabled === true;
    if (jinaExplicitlyEnabled && (!searxngEnvFailed || jinaExplicitlyEnabled)) {
      providers.push(new JinaSearchProvider(timeout));
    }

    // If all providers are explicitly disabled, return empty
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
    const discoverCount = isDeep ? maxResults * 3 : maxResults * 2;

    // Apply platform site: prefix to narrow search scope (skip for "web" or unknown)
    const platform = options?.platform;
    const platformDomain = platform ? this.platformSite(platform) : "";
    const searchQuery = platformDomain
      ? `${sanitized} site:${platformDomain}`
      : sanitized;

    // Normalize platform for cache key: "web" produces no site: prefix just like
    // undefined, so they should share the same cache slot.
    const cacheplatform = platformDomain ? (platform ?? "") : "";

    const cached = this.cache.get(
      searchQuery,
      maxResults,
      isDeep,
      cacheplatform,
    );
    if (cached) {
      return {
        ...cached,
        meta: { ...cached.meta, searchTimeMs: Date.now() - startTime },
      };
    }

    const raw = await this.searchEngine.discover(searchQuery, discoverCount);
    const verified = this.verifyEngine.verify(raw, sanitized);
    let safe = this.outputShield.protect(verified.results);

    // In deep mode, filter to only verified/conflicted results
    if (isDeep) {
      safe = safe.filter((r) => r.trust !== "unverified");
    }

    // Enforce maxResults after all filtering
    safe = safe.slice(0, maxResults);

    const response: KaguraResponse = {
      query,
      results: safe,
      meta: {
        engines: this.searchEngine.lastEnginesUsed,
        totalResults: safe.length,
        conflicts: verified.conflicts,
        searchTimeMs: Date.now() - startTime,
      },
    };

    this.cache.set(searchQuery, maxResults, response, isDeep, cacheplatform);

    return response;
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
    const discoverCount = Math.max(maxResults, minSources) * 4;

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
