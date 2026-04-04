import { describe, it, expect, vi, beforeEach } from "vitest";
import { BraveHTMLProvider } from "../../../src/search/providers/brave-html.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const SAMPLE_BRAVE_HTML = `
<div id="results">
  <div class="snippet" data-type="web">
    <div class="snippet-title">
      <a href="https://example.com/brave1"><span>Brave Result One</span></a>
    </div>
    <div class="snippet-description">First brave search result snippet text</div>
  </div>
  <div class="snippet" data-type="web">
    <div class="snippet-title">
      <a href="https://example.com/brave2"><span>Brave Result Two</span></a>
    </div>
    <div class="snippet-description">Second brave search result snippet</div>
  </div>
</div>
`;

describe("BraveHTMLProvider", () => {
  let provider: BraveHTMLProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new BraveHTMLProvider();
  });

  it("has correct metadata", () => {
    expect(provider.name).toBe("brave");
    expect(provider.tier).toBe(0);
  });

  it("isAvailable returns true", () => {
    expect(provider.isAvailable()).toBe(true);
  });

  it("parses Brave search results from HTML", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => SAMPLE_BRAVE_HTML,
    });

    const results = await provider.search("test query");
    expect(results.length).toBe(2);
    expect(results[0].title).toBe("Brave Result One");
    expect(results[0].url).toBe("https://example.com/brave1");
    expect(results[0].snippet).toBe("First brave search result snippet text");
    expect(results[0].engine).toBe("brave");
    expect(results[1].title).toBe("Brave Result Two");
  });

  it("returns empty on fetch failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const results = await provider.search("test");
    expect(results).toEqual([]);
  });

  it("returns empty on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    const results = await provider.search("test");
    expect(results).toEqual([]);
  });

  it("respects maxResults", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => SAMPLE_BRAVE_HTML,
    });
    const results = await provider.search("test", 1);
    expect(results).toHaveLength(1);
  });

  it("uses correct search URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "<html></html>",
    });
    await provider.search("hello world");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("search.brave.com/search");
    expect(url).toContain("q=hello+world");
  });
});
