import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchCache } from "../../src/search/cache.js";
import type { KaguraResponse } from "../../src/types.js";

function makeResponse(query: string, n: number): KaguraResponse {
  return {
    query,
    results: Array.from({ length: n }, (_, i) => ({
      title: `Result ${i}`,
      source: `https://example.com/${i}`,
      content: `Content ${i}`,
      trust: "unverified" as const,
      score: 0.4,
      matchedSources: 1,
    })),
    meta: {
      engines: ["test"],
      totalResults: n,
      conflicts: 0,
      searchTimeMs: 100,
    },
  };
}

describe("SearchCache", () => {
  let cache: SearchCache;

  beforeEach(() => {
    cache = new SearchCache({ maxEntries: 3, ttlMs: 5000 });
  });

  it("returns undefined on cache miss", () => {
    expect(cache.get("missing", 10)).toBeUndefined();
  });

  it("stores and retrieves a response", () => {
    const resp = makeResponse("hello", 2);
    cache.set("hello", 10, resp);
    expect(cache.get("hello", 10)).toEqual(resp);
  });

  it("returns undefined for same query but different maxResults", () => {
    const resp = makeResponse("hello", 2);
    cache.set("hello", 10, resp);
    expect(cache.get("hello", 5)).toBeUndefined();
  });

  it("evicts LRU entry when maxEntries exceeded", () => {
    cache.set("a", 10, makeResponse("a", 1));
    cache.set("b", 10, makeResponse("b", 1));
    cache.set("c", 10, makeResponse("c", 1));
    cache.get("a", 10);
    cache.set("d", 10, makeResponse("d", 1));
    expect(cache.get("b", 10)).toBeUndefined();
    expect(cache.get("a", 10)).toBeDefined();
    expect(cache.get("d", 10)).toBeDefined();
  });

  it("expires entries after TTL", () => {
    vi.useFakeTimers();
    cache.set("hello", 10, makeResponse("hello", 2));
    vi.advanceTimersByTime(6000);
    expect(cache.get("hello", 10)).toBeUndefined();
    vi.useRealTimers();
  });

  it("clear() removes all entries", () => {
    cache.set("a", 10, makeResponse("a", 1));
    cache.set("b", 10, makeResponse("b", 1));
    cache.clear();
    expect(cache.get("a", 10)).toBeUndefined();
    expect(cache.get("b", 10)).toBeUndefined();
  });
});
