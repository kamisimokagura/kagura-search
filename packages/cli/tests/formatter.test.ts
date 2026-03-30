import { describe, it, expect } from "vitest";
import { formatResult, formatMeta } from "../src/formatter.js";
import type { SearchResult, SearchMeta } from "@kagura/core";

describe("formatter", () => {
  it("formatResult shows trust emoji for verified", () => {
    const result: SearchResult = {
      title: "Test Result",
      source: "https://example.com",
      content: "Test content here",
      trust: "verified",
      score: 0.95,
      matchedSources: 5,
    };
    const output = formatResult(result);
    expect(output).toContain("[verified]");
    expect(output).toContain("Test Result");
    expect(output).toContain("https://example.com");
  });

  it("formatResult shows warning for conflicted", () => {
    const result: SearchResult = {
      title: "Conflict",
      source: "https://example.com",
      content: "Conflicting info",
      trust: "conflicted",
      score: 0.3,
      matchedSources: 2,
    };
    const output = formatResult(result);
    expect(output).toContain("[conflicted]");
  });

  it("formatMeta shows search summary", () => {
    const meta: SearchMeta = {
      engines: ["searxng", "duckduckgo"],
      totalResults: 8,
      conflicts: 1,
      searchTimeMs: 1500,
    };
    const output = formatMeta(meta);
    expect(output).toContain("2");
    expect(output).toContain("8");
    expect(output).toContain("1.5s");
  });
});
