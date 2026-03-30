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

  it("uses html.duckduckgo.com endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "<html></html>",
    });

    await provider.search("test query");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("html.duckduckgo.com");
  });
});
