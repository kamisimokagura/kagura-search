import { describe, it, expect, vi } from "vitest";
import { SearchEngine } from "../../src/search/engine.js";
import type { SearchProvider } from "../../src/search/provider.js";
import type { RawSearchResult } from "../../src/types.js";

function createMockProvider(
  name: string,
  tier: 0 | 1 | 2,
  results: RawSearchResult[],
  available = true,
): SearchProvider {
  return {
    name,
    tier,
    isAvailable: () => available,
    search: vi.fn().mockResolvedValue(results),
  };
}

describe("SearchEngine", () => {
  it("queries available providers and merges results", async () => {
    const p1 = createMockProvider("p1", 0, [
      { title: "A", url: "https://a.com", snippet: "A content", engine: "p1" },
    ]);
    const p2 = createMockProvider("p2", 0, [
      { title: "B", url: "https://b.com", snippet: "B content", engine: "p2" },
    ]);

    const engine = new SearchEngine([p1, p2]);
    const results = await engine.discover("test");

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.title)).toContain("A");
    expect(results.map((r) => r.title)).toContain("B");
  });

  it("skips unavailable providers", async () => {
    const available = createMockProvider("good", 0, [
      {
        title: "Good",
        url: "https://good.com",
        snippet: "good",
        engine: "good",
      },
    ]);
    const unavailable = createMockProvider("bad", 1, [], false);

    const engine = new SearchEngine([available, unavailable]);
    const results = await engine.discover("test");

    expect(results).toHaveLength(1);
    expect(unavailable.search).not.toHaveBeenCalled();
  });

  it("deduplicates results by URL", async () => {
    const p1 = createMockProvider("p1", 0, [
      { title: "Same", url: "https://same.com", snippet: "A", engine: "p1" },
    ]);
    const p2 = createMockProvider("p2", 0, [
      { title: "Same", url: "https://same.com", snippet: "B", engine: "p2" },
    ]);

    const engine = new SearchEngine([p1, p2]);
    const results = await engine.discover("test");

    expect(results).toHaveLength(1);
  });

  it("handles provider errors gracefully", async () => {
    const good = createMockProvider("good", 0, [
      { title: "OK", url: "https://ok.com", snippet: "ok", engine: "good" },
    ]);
    const broken: SearchProvider = {
      name: "broken",
      tier: 0,
      isAvailable: () => true,
      search: vi.fn().mockRejectedValue(new Error("boom")),
    };

    const engine = new SearchEngine([good, broken]);
    const results = await engine.discover("test");

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("OK");
  });

  it("returns engines used in metadata", async () => {
    const p1 = createMockProvider("searxng", 0, [
      { title: "A", url: "https://a.com", snippet: "a", engine: "searxng" },
    ]);

    const engine = new SearchEngine([p1]);
    const results = await engine.discover("test");

    expect(engine.lastEnginesUsed).toContain("searxng");
  });

  it("preserves case-sensitive paths during deduplication", async () => {
    const p1 = createMockProvider("p1", 0, [
      {
        title: "API endpoint",
        url: "https://example.com/API/v1",
        snippet: "api",
        engine: "p1",
      },
      {
        title: "api endpoint",
        url: "https://example.com/api/v1",
        snippet: "api",
        engine: "p1",
      },
    ]);

    const engine = new SearchEngine([p1]);
    const results = await engine.discover("test");

    expect(results).toHaveLength(2);
  });

  it("deduplicates same URL with different hostname case", async () => {
    const p1 = createMockProvider("p1", 0, [
      {
        title: "Same A",
        url: "https://Example.COM/page",
        snippet: "a",
        engine: "p1",
      },
      {
        title: "Same B",
        url: "https://example.com/page",
        snippet: "b",
        engine: "p1",
      },
    ]);

    const engine = new SearchEngine([p1]);
    const results = await engine.discover("test");

    expect(results).toHaveLength(1);
  });

  it("racing returns fast provider results without waiting for slow ones", async () => {
    const fast: SearchProvider = {
      name: "fast",
      tier: 0,
      isAvailable: () => true,
      search: vi.fn().mockResolvedValue([
        {
          title: "Fast",
          url: "https://fast.com",
          snippet: "quick",
          engine: "fast",
        },
        {
          title: "Fast2",
          url: "https://fast2.com",
          snippet: "quick2",
          engine: "fast",
        },
      ]),
    };
    const slow: SearchProvider = {
      name: "slow",
      tier: 1,
      isAvailable: () => true,
      search: vi
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve([
                    {
                      title: "Slow",
                      url: "https://slow.com",
                      snippet: "delayed",
                      engine: "slow",
                    },
                  ]),
                10000,
              ),
            ),
        ),
    };

    const engine = new SearchEngine([fast, slow]);
    const results = await engine.discover("test", 2, {
      graceMs: 100,
      timeoutMs: 500,
    });

    expect(results.some((r) => r.title === "Fast")).toBe(true);
  });

  it("racing merges results from multiple fast providers", async () => {
    const p1: SearchProvider = {
      name: "p1",
      tier: 0,
      isAvailable: () => true,
      search: vi
        .fn()
        .mockResolvedValue([
          { title: "A", url: "https://a.com", snippet: "a", engine: "p1" },
        ]),
    };
    const p2: SearchProvider = {
      name: "p2",
      tier: 0,
      isAvailable: () => true,
      search: vi
        .fn()
        .mockResolvedValue([
          { title: "B", url: "https://b.com", snippet: "b", engine: "p2" },
        ]),
    };

    const engine = new SearchEngine([p1, p2]);
    const results = await engine.discover("test", 2, {
      graceMs: 500,
      timeoutMs: 5000,
    });

    expect(results).toHaveLength(2);
  });

  it("racing falls back gracefully when all providers are slow", async () => {
    const slow: SearchProvider = {
      name: "slow",
      tier: 0,
      isAvailable: () => true,
      search: vi
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve([
                    {
                      title: "Eventually",
                      url: "https://eventually.com",
                      snippet: "done",
                      engine: "slow",
                    },
                  ]),
                200,
              ),
            ),
        ),
    };

    const engine = new SearchEngine([slow]);
    const results = await engine.discover("test", 1, {
      graceMs: 100,
      timeoutMs: 5000,
    });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Eventually");
  });
});
