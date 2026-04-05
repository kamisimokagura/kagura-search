import { describe, it, expect, vi, beforeEach } from "vitest";
import { GoogleHTMLProvider } from "../../../src/search/providers/google.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("GoogleHTMLProvider", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("has correct metadata", () => {
    const provider = new GoogleHTMLProvider();
    expect(provider.name).toBe("google");
    expect(provider.tier).toBe(0);
  });

  it("isAvailable returns true by default", () => {
    const provider = new GoogleHTMLProvider();
    expect(provider.isAvailable()).toBe(true);
  });

  it("parses Google /url?q= link pattern", async () => {
    const provider = new GoogleHTMLProvider();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => `
        <div class="g">
          <a href="/url?q=https%3A%2F%2Fexample.com%2Fpage&amp;sa=U">
            <h3>Example Page Title</h3>
          </a>
          <span class="VwiC3b">This is the snippet text.</span>
        </div>
      `,
    });

    const results = await provider.search("test query");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Example Page Title");
    expect(results[0].url).toBe("https://example.com/page");
    expect(results[0].snippet).toBe("This is the snippet text.");
    expect(results[0].engine).toBe("google");
  });

  it("parses fallback direct link pattern", async () => {
    const provider = new GoogleHTMLProvider();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => `
        <div>
          <a href="https://example.com/direct">
            <h3>Direct Link Title</h3>
          </a>
        </div>
      `,
    });

    const results = await provider.search("test");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Direct Link Title");
    expect(results[0].url).toBe("https://example.com/direct");
  });

  it("returns empty on HTTP error", async () => {
    const provider = new GoogleHTMLProvider();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    const results = await provider.search("test");
    expect(results).toEqual([]);
  });

  it("returns empty on network error", async () => {
    const provider = new GoogleHTMLProvider();
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const results = await provider.search("test");
    expect(results).toEqual([]);
  });

  it("trips breaker on 429", async () => {
    const provider = new GoogleHTMLProvider();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    await provider.search("test");
    expect(provider.isAvailable()).toBe(false);
  });
});
