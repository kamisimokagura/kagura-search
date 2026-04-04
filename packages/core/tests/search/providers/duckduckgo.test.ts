import { describe, it, expect, vi, beforeEach } from "vitest";
import { DuckDuckGoProvider } from "../../../src/search/providers/duckduckgo.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const SAMPLE_HTML = `
<div class="results">
  <div class="result">
    <a class="result__a" href="https://example.com/page1">
      <span>First Result Title</span>
    </a>
    <a class="result__snippet">First result snippet text here</a>
  </div>
  <div class="result">
    <a class="result__a" href="https://example.com/page2">
      <span>Second Result Title</span>
    </a>
    <a class="result__snippet">Second result snippet</a>
  </div>
</div>
`;

describe("DuckDuckGoProvider", () => {
  let provider: DuckDuckGoProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new DuckDuckGoProvider();
  });

  it("has correct metadata", () => {
    expect(provider.name).toBe("duckduckgo");
    expect(provider.tier).toBe(0);
  });

  it("isAvailable returns true", () => {
    expect(provider.isAvailable()).toBe(true);
  });

  it("search parses HTML results", async () => {
    // First call: GET duckduckgo.com for vqd — none found, triggers HTML fallback
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "<html>no vqd here</html>",
    });
    // Second call: HTML fallback
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => SAMPLE_HTML,
    });

    const results = await provider.search("test");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].engine).toBe("duckduckgo");
  });

  it("search returns empty on failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Failed"));
    const results = await provider.search("test");
    expect(results).toEqual([]);
  });

  it("uses html.duckduckgo.com endpoint as fallback", async () => {
    // First call: GET duckduckgo.com for vqd — none found
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "<html>no vqd here</html>",
    });
    // Second call: HTML fallback
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "<html></html>",
    });

    await provider.search("test query");
    // The first call is to duckduckgo.com (vqd extraction)
    const firstUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstUrl).toContain("duckduckgo.com");
    // The second call (HTML fallback) uses html.duckduckgo.com
    const secondUrl = mockFetch.mock.calls[1][0] as string;
    expect(secondUrl).toContain("html.duckduckgo.com");
  });

  it("tries JSON API first and falls back to HTML", async () => {
    // First call: GET duckduckgo.com for vqd token — no token found
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "<html>no vqd here</html>",
    });
    // Second call: HTML fallback
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => SAMPLE_HTML,
    });

    const results = await provider.search("test query");
    expect(results.length).toBeGreaterThan(0);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("uses JSON API results when vqd token is found", async () => {
    // First call: GET duckduckgo.com with vqd token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<script>vqd="test-vqd-token-123"</script>`,
    });
    // Second call: d.js JSONP response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `DDG.pageLayout.load('d',[{"t":"JSON Title","u":"https://json.example.com","a":"JSON snippet content"}]);`,
    });

    const results = await provider.search("json test");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe("JSON Title");
    expect(results[0].url).toBe("https://json.example.com");
    expect(results[0].snippet).toBe("JSON snippet content");
  });
});
