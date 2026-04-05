import { describe, it, expect, vi, beforeEach } from "vitest";
import { BraveAPIProvider } from "../../../src/search/providers/brave-api.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("BraveAPIProvider", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("isAvailable returns false when no API key", () => {
    const provider = new BraveAPIProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it("isAvailable returns true when API key provided", () => {
    const provider = new BraveAPIProvider("test-key");
    expect(provider.isAvailable()).toBe(true);
  });

  it("has correct metadata", () => {
    const provider = new BraveAPIProvider("key");
    // Shares "brave" identity with BraveHTMLProvider for dedup/scoring
    expect(provider.name).toBe("brave");
    expect(provider.tier).toBe(0);
  });

  it("parses API response correctly", async () => {
    const provider = new BraveAPIProvider("test-key");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              title: "API Result",
              url: "https://api.example.com",
              description: "From Brave API",
            },
          ],
        },
      }),
    });

    const results = await provider.search("test query");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("API Result");
    expect(results[0].url).toBe("https://api.example.com");
    expect(results[0].snippet).toBe("From Brave API");
    expect(results[0].engine).toBe("brave");
  });

  it("sends correct headers with API key", async () => {
    const provider = new BraveAPIProvider("my-secret-key");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    await provider.search("test");
    const headers = mockFetch.mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    expect(headers["X-Subscription-Token"]).toBe("my-secret-key");
  });

  it("returns empty on failure", async () => {
    const provider = new BraveAPIProvider("key");
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const results = await provider.search("test");
    expect(results).toEqual([]);
  });
});
