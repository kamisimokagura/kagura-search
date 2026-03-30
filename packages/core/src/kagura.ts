import type { KaguraConfig, KaguraResponse, SearchQuery } from "./types.js";
import { loadConfig } from "./config.js";
import { InputGuard } from "./security/input-guard.js";
import { OutputShield } from "./security/output-shield.js";
import { SearchEngine } from "./search/engine.js";
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

    const providers = [
      new SearXNGProvider(this.config.providers.searxng?.baseUrl),
      new DuckDuckGoProvider(),
    ];

    this.searchEngine = new SearchEngine(providers);
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

    const raw = await this.searchEngine.discover(sanitized, maxResults);
    const verified = this.verifyEngine.verify(raw, sanitized);
    const safe = this.outputShield.protect(verified.results);

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

  async verify(claim: string): Promise<KaguraResponse> {
    return this.search(claim, { deep: true });
  }
}
