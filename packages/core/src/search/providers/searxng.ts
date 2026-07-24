import type { SearchProvider } from "../provider.js";
import { RateLimitBreaker } from "../provider.js";
import type { RawSearchResult } from "../../types.js";
import { InputGuard } from "../../security/input-guard.js";

const PUBLIC_INSTANCES = [
  "https://search.sapti.me",
  "https://searx.tiekoetter.com",
  "https://search.bus-hit.me",
  "https://searx.be",
  "https://search.ononoki.org",
  "https://searx.zhenyapav.com",
  "https://search.hbubli.cc",
  "https://searx.work",
];

export interface SearXNGConfig {
  instances?: string[];
  baseUrl?: string;
  timeout?: number;
}

export class SearXNGProvider implements SearchProvider {
  readonly name = "searxng";
  readonly tier = 0 as const;
  private instances: string[];
  private timeout: number;
  private breakers = new Map<string, RateLimitBreaker>();

  constructor(config?: string | SearXNGConfig, timeout?: number) {
    if (config === undefined || config === null) {
      this.instances = [...PUBLIC_INSTANCES];
      this.timeout = timeout ?? 5000;
    } else if (typeof config === "string") {
      this.instances = [config];
      this.timeout = timeout ?? 5000;
    } else {
      if (config.instances && config.instances.length > 0) {
        this.instances = [...config.instances];
      } else if (config.baseUrl) {
        this.instances = [config.baseUrl];
      } else {
        this.instances = [...PUBLIC_INSTANCES];
      }
      this.timeout = config.timeout ?? timeout ?? 5000;
    }
  }

  private getBreaker(instance: string): RateLimitBreaker {
    let b = this.breakers.get(instance);
    if (!b) {
      b = new RateLimitBreaker();
      this.breakers.set(instance, b);
    }
    return b;
  }

  isAvailable(): boolean {
    // Available if at least one instance is not rate-limited
    return this.instances.some((i) => !this.getBreaker(i).isOpen);
  }

  async search(query: string, maxResults = 10): Promise<RawSearchResult[]> {
    if (this.instances.length === 1) {
      return this.searchInstance(this.instances[0], query, maxResults);
    }
    return this.raceInstances(query, maxResults);
  }

  private async raceInstances(
    query: string,
    maxResults: number,
  ): Promise<RawSearchResult[]> {
    // Filter out rate-limited instances
    const available = this.instances.filter((i) => !this.getBreaker(i).isOpen);
    if (available.length === 0) return [];

    // Race: resolve as soon as ANY instance returns non-empty results
    try {
      return await Promise.any(
        available.map((instance) =>
          this.searchInstance(instance, query, maxResults).then((results) => {
            if (results.length === 0) throw new Error("empty");
            return results;
          }),
        ),
      );
    } catch {
      // All instances failed or returned empty
      return [];
    }
  }

  private async searchInstance(
    baseUrl: string,
    query: string,
    maxResults: number,
  ): Promise<RawSearchResult[]> {
    const encoded = encodeURIComponent(query).replace(/%20/g, "+");
    const url = `${baseUrl}/search?q=${encoded}&format=json&limit=${maxResults}`;

    try {
      // Follow redirects manually and re-validate each hop: the initial instance
      // URL is trusted, but a 3xx could point at an internal/loopback host, so we
      // must not blindly follow it (SSRF). Cap hops to avoid redirect loops.
      const response = await this.fetchSafeRedirect(url);

      if (!response.ok) {
        if (response.status === 429 || response.status === 403) {
          this.getBreaker(baseUrl).trip();
        }
        return [];
      }

      this.getBreaker(baseUrl).reset();
      const data = await response.json();
      return (data.results ?? []).map(
        (r: {
          title: string;
          url: string;
          content: string;
          engine: string;
        }) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: r.content ?? "",
          engine: r.engine ?? "searxng",
        }),
      );
    } catch {
      return [];
    }
  }

  // fetch with manual redirect handling that re-validates every hop via
  // InputGuard (SSRF defense: a trusted instance may 302 to an internal host).
  // Redirects are only followed within the SAME ORIGIN as the original trusted
  // instance — this closes DNS-rebinding/TOCTOU gaps without DNS pinning, since
  // we never connect to a host we did not already trust for the initial request.
  private async fetchSafeRedirect(url: string): Promise<Response> {
    const guard = new InputGuard();
    let baseOrigin: string;
    try {
      baseOrigin = new URL(url).origin;
    } catch {
      return new Response(null, { status: 421 });
    }
    let current = url;
    const MAX_REDIRECTS = 4;
    // Best-effort cancellation of a discarded response body. A hostile instance can
    // stream a 3xx body to hold connections/resources across concurrent searches;
    // cancelling keeps the fetch from lingering. Cleanup failure is non-fatal: the
    // fail-closed synthetic response below still applies.
    const discardBody = async (r: Response) => {
      try {
        await r.body?.cancel();
      } catch {
        /* best-effort */
      }
    };
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
      const response = await fetch(current, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeout),
        redirect: "manual",
      });
      const status = response.status ?? 200;
      if (status < 300 || status >= 400) {
        return response; // success or non-redirect error -> done
      }
      if (redirect === MAX_REDIRECTS) {
        await discardBody(response);
        return new Response(null, { status: 508 }); // too many redirects
      }
      const location = response.headers?.get?.("location");
      if (!location) {
        // 3xx with no target: consume the (possibly streaming) body before returning.
        await discardBody(response);
        return new Response(null, { status: response.status ?? 200 });
      }
      const absolute = this.resolveLocation(current, location);
      let target: URL;
      try {
        target = new URL(absolute ?? "");
      } catch {
        await discardBody(response);
        return new Response(null, { status: 421 });
      }
      // Only follow same-origin redirects; cross-origin (even if it text-validates)
      // is blocked to prevent DNS-rebinding to an internal host.
      if (target.origin !== baseOrigin || guard.validateUrl(target.toString()).blocked) {
        await discardBody(response);
        return new Response(null, { status: 421 }); // unreachable/blocked target
      }
      // Allowed same-origin hop: consume the 3xx body before following.
      await discardBody(response);
      current = target.toString();
    }
    return new Response(null, { status: 508 });
  }

  private resolveLocation(base: string, location: string): string | null {
    try {
      return new URL(location, base).toString();
    } catch {
      return null;
    }
  }
}
