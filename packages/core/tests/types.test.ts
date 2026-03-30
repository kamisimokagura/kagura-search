import { describe, it, expect } from "vitest";
import type {
  SearchResult,
  SearchMeta,
  KaguraResponse,
  TrustLevel,
  SearchProviderConfig,
  KaguraConfig,
  Platform,
} from "../src/types.js";

describe("types", () => {
  it("SearchResult has required fields", () => {
    const result: SearchResult = {
      title: "Test",
      source: "https://example.com",
      content: "Test content",
      trust: "verified",
      score: 0.95,
      matchedSources: 3,
    };
    expect(result.trust).toBe("verified");
    expect(result.score).toBeGreaterThan(0);
    expect(result.source).toMatch(/^https?:\/\//);
  });

  it("TrustLevel only allows valid values", () => {
    const levels: TrustLevel[] = ["verified", "unverified", "conflicted"];
    expect(levels).toHaveLength(3);
  });

  it("KaguraResponse includes meta", () => {
    const response: KaguraResponse = {
      query: "test",
      results: [],
      meta: {
        engines: ["searxng"],
        totalResults: 0,
        conflicts: 0,
        searchTimeMs: 100,
      },
    };
    expect(response.meta.engines).toContain("searxng");
  });

  it("Platform covers all supported SNS", () => {
    const platforms: Platform[] = [
      "web",
      "twitter",
      "reddit",
      "youtube",
      "instagram",
      "tiktok",
      "github",
    ];
    expect(platforms).toHaveLength(7);
  });

  it("KaguraConfig has sensible defaults structure", () => {
    const config: KaguraConfig = {
      providers: {},
    };
    expect(config.providers).toBeDefined();
    expect(config.ai).toBeUndefined();
  });
});
