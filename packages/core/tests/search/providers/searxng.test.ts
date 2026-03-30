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
      ok: true,
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
      ok: true,
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
});
