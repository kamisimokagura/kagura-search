import { describe, it, expect, vi, beforeEach } from "vitest";
import { JinaSearchProvider } from "../../../src/search/providers/jina-search.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("JinaSearchProvider", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("has correct metadata", () => {
    const provider = new JinaSearchProvider();
    expect(provider.name).toBe("jina");
    expect(provider.tier).toBe(1);
  });

  it("isAvailable returns true by default", () => {
    const provider = new JinaSearchProvider();
    expect(provider.isAvailable()).toBe(true);
  });

  it("parses Jina search response", async () => {
    const provider = new JinaSearchProvider();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            title: "Jina Result",
            url: "https://example.com",
            description: "Found via Jina",
          },
        ],
      }),
    });

    const results = await provider.search("test query");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Jina Result");
    expect(results[0].url).toBe("https://example.com");
    expect(results[0].snippet).toBe("Found via Jina");
    expect(results[0].engine).toBe("jina");
  });

  it("uses s.jina.ai endpoint", async () => {
    const provider = new JinaSearchProvider();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });

    await provider.search("hello world");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe("https://s.jina.ai/" + encodeURIComponent("hello world"));
  });

  it("returns empty on error", async () => {
    const provider = new JinaSearchProvider();
    mockFetch.mockRejectedValueOnce(new Error("Failed"));
    const results = await provider.search("test");
    expect(results).toEqual([]);
  });

  it("trips breaker on 429", async () => {
    const provider = new JinaSearchProvider();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    await provider.search("test");
    expect(provider.isAvailable()).toBe(false);
  });

  it("falls back to content when description is missing", async () => {
    const provider = new JinaSearchProvider();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            title: "No Desc",
            url: "https://example.com",
            content: "Long content that gets truncated to 200 chars",
          },
        ],
      }),
    });

    const results = await provider.search("test");
    expect(results[0].snippet).toBe(
      "Long content that gets truncated to 200 chars",
    );
  });
});
