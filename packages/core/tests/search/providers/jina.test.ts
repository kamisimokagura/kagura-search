import { describe, it, expect, vi, beforeEach } from "vitest";
import { JinaExtractor } from "../../../src/search/providers/jina.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("JinaExtractor", () => {
  let extractor: JinaExtractor;

  beforeEach(() => {
    mockFetch.mockReset();
    extractor = new JinaExtractor();
  });

  it("has correct name", () => {
    expect(extractor.name).toBe("jina");
  });

  it("extract returns markdown content", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "# Page Title\n\nSome markdown content here.",
    });

    const content = await extractor.extract("https://example.com");
    expect(content).toContain("Page Title");
    expect(content).toContain("markdown content");
  });

  it("extract uses r.jina.ai prefix", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "content",
    });

    await extractor.extract("https://example.com/page");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe("https://r.jina.ai/https://example.com/page");
  });

  it("extract returns null on error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Failed"));
    const content = await extractor.extract("https://example.com");
    expect(content).toBeNull();
  });

  it("extract returns null for non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    const content = await extractor.extract("https://example.com");
    expect(content).toBeNull();
  });
});
