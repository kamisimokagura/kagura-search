import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearXNGProvider } from "../../../src/search/providers/searxng.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("SearXNGProvider", () => {
  let provider: SearXNGProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new SearXNGProvider();
  });

  it("has correct metadata", () => {
    expect(provider.name).toBe("searxng");
    expect(provider.tier).toBe(0);
  });

  it("isAvailable returns true (no API key needed)", () => {
    expect(provider.isAvailable()).toBe(true);
  });

  it("search returns parsed results", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        results: [
          {
            title: "Test Result",
            url: "https://example.com",
            content: "Test snippet",
            engine: "google",
          },
          {
            title: "Another Result",
            url: "https://example.org",
            content: "Another snippet",
            engine: "bing",
          },
        ],
      }),
    });

    const results = await provider.search("test query");

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Test Result");
    expect(results[0].url).toBe("https://example.com");
    expect(results[0].snippet).toBe("Test snippet");
    expect(results[0].engine).toBe("google");
  });

  it("search returns empty array on error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const results = await provider.search("test");
    expect(results).toEqual([]);
  });

  it("constructs correct URL with format=json", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({ results: [] }),
    });

    await provider.search("hello world");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("format=json");
    expect(calledUrl).toContain("q=hello+world");
  });

  it("uses custom baseUrl when configured", () => {
    const custom = new SearXNGProvider("http://localhost:8888");
    expect(custom.isAvailable()).toBe(true);
  });

  it("races multiple instances and returns results from fastest", async () => {
    const provider = new SearXNGProvider({
      instances: ["https://a.example", "https://b.example"],
      timeout: 5000,
    });

    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith("https://a.example")) {
        return Promise.resolve({
          status: 200,
          ok: true,
          headers: { get: () => null },
          json: async () => ({
            results: [
              {
                title: "From A",
                url: "https://a.com",
                content: "a content",
                engine: "google",
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        status: 200,
        ok: true,
        headers: { get: () => null },
        json: async () => ({
          results: [
            {
              title: "From B",
              url: "https://b.com",
              content: "b content",
              engine: "bing",
            },
          ],
        }),
      });
    });

    const results = await provider.search("test");
    expect(results.length).toBeGreaterThan(0);
  });

  it("falls back when all pool instances fail", async () => {
    const provider = new SearXNGProvider({
      instances: ["https://bad1.example", "https://bad2.example"],
      timeout: 1000,
    });

    mockFetch.mockRejectedValue(new Error("All failed"));
    const results = await provider.search("test");
    expect(results).toEqual([]);
  });

  it("follows a same-origin redirect (SSRF-safe)", async () => {
    const single = new SearXNGProvider("https://single.example");
    mockFetch
      .mockResolvedValueOnce({
        status: 302,
        ok: false,
        headers: { get: (h: string) => (h.toLowerCase() === "location" ? "https://single.example/next" : null) },
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: { get: () => null },
        json: async () => ({ results: [{ title: "R", url: "https://r.com", content: "c", engine: "g" }] }),
      });

    const results = await single.search("test");
    expect(results).toHaveLength(1);
    expect(mockFetch.mock.calls[1][0]).toBe("https://single.example/next");
  });

  it("does not follow a cross-origin redirect (DNS-rebinding defense)", async () => {
    const single = new SearXNGProvider("https://single.example");
    mockFetch.mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: { get: (h: string) => (h.toLowerCase() === "location" ? "https://real.example/next" : null) },
      json: async () => ({}),
    });

    const results = await single.search("test");
    // Cross-origin redirect target is blocked (fail closed for the hop).
    expect(results).toEqual([]);
    // Must NOT have followed the redirect: exactly one fetch, and it used manual redirect.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][1]).toHaveProperty("redirect", "manual");
  });

  it("does not follow a redirect to an internal/loopback host (SSRF defense)", async () => {
    const single = new SearXNGProvider("https://single.example");
    mockFetch.mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: { get: (h: string) => (h.toLowerCase() === "location" ? "http://169.254.169.254/latest" : null) },
      json: async () => ({}),
    });

    const results = await single.search("test");
    // Blocked redirect target yields no results (fail closed for the hop).
    expect(results).toEqual([]);
    // Must NOT have followed the redirect: exactly one fetch, and it used manual redirect.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][1]).toHaveProperty("redirect", "manual");
  });

  it("stops after the redirect hop cap (no infinite loop)", async () => {
    const single = new SearXNGProvider("https://single.example");
    // Every response is a same-origin 302 → exercises the hop cap, not the cross-origin block.
    mockFetch.mockImplementation(async () => ({
      status: 302,
      ok: false,
      headers: { get: (h: string) => (h.toLowerCase() === "location" ? "/next" : null) },
      json: async () => ({}),
    }));

    const results = await single.search("test");
    // 4 redirects followed + the final target fetch = 5 fetches, then 508 (fail closed).
    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(results).toEqual([]);
    // Every fetch used manual redirect (no native auto-follow that could bypass the cap).
    for (const call of mockFetch.mock.calls) {
      expect(call[1]).toHaveProperty("redirect", "manual");
    }
  });

  it("cancels the discarded 3xx response body on a blocked redirect (hostile streaming defense)", async () => {
    const single = new SearXNGProvider("https://single.example");
    const cancel = vi.fn().mockResolvedValue(undefined);
    mockFetch.mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: { get: (h: string) => (h.toLowerCase() === "location" ? "https://real.example/next" : null) },
      body: { cancel },
      json: async () => ({}),
    });

    const results = await single.search("test");
    // Cross-origin redirect target is blocked (fail closed for the hop).
    expect(results).toEqual([]);
    // The discarded 3xx body must be cancelled to avoid holding connections.
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("blocks a same-origin redirect rejected by InputGuard.validateUrl (per-hop validation)", async () => {
    const single = new SearXNGProvider("https://single.example");
    // Same-origin but an over-length path → InputGuard.validateUrl blocks it even though
    // same-origin checks pass. Proves the validation path runs on every hop.
    const longPath = "/next?" + "a".repeat(10_000);
    mockFetch.mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: { get: (h: string) => (h.toLowerCase() === "location" ? longPath : null) },
      json: async () => ({}),
    });

    const results = await single.search("test");
    expect(results).toEqual([]);
    // Exactly one fetch (initial), no follow; manual redirect mode throughout.
    const call = mockFetch.mock.calls[0];
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(call[1]).toHaveProperty("redirect", "manual");
  });

  it("cancels a targetless 3xx response body (no Location header, no SSRF bypass)", async () => {
    const single = new SearXNGProvider("https://single.example");
    const cancel = vi.fn().mockResolvedValue(undefined);
    mockFetch.mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: { get: () => null },
      body: { cancel },
      json: async () => ({}),
    });

    const results = await single.search("test");
    // 3xx without Location → no results (caller can't proceed); body must be cancelled.
    expect(results).toEqual([]);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels a followed (allowed same-origin) 3xx body before the next fetch", async () => {
    const single = new SearXNGProvider("https://single.example");
    const order: string[] = [];
    const cancel = vi.fn().mockImplementation(async () => {
      order.push("cancel");
    });
    mockFetch.mockImplementation(async (url: string) => {
      order.push("fetch");
      if (url === "https://single.example/next") {
        return {
          status: 200,
          ok: true,
          headers: { get: () => null },
          json: async () => ({ results: [{ title: "R", url: "https://r.com", content: "c", engine: "g" }] }),
        };
      }
      return {
        status: 302,
        ok: false,
        headers: { get: (h: string) => (h.toLowerCase() === "location" ? "/next" : null) },
        body: { cancel },
        json: async () => ({}),
      };
    });

    const results = await single.search("test");
    expect(results).toHaveLength(1);
    // The 3xx body must be cancelled BEFORE the next fetch happens.
    expect(cancel).toHaveBeenCalledTimes(1);
    const cancelIdx = order.indexOf("cancel");
    const secondFetchIdx = order.lastIndexOf("fetch");
    expect(cancelIdx).toBeLessThan(secondFetchIdx);
  });

  it("accepts single baseUrl for backward compat", () => {
    const provider = new SearXNGProvider("http://localhost:8888");
    expect(provider.isAvailable()).toBe(true);
  });

  it("accepts config object with baseUrl", () => {
    const provider = new SearXNGProvider({
      baseUrl: "http://custom:8888",
      timeout: 3000,
    });
    expect(provider.isAvailable()).toBe(true);
  });
});
