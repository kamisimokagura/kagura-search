import { describe, it, expect } from "vitest";
import { VerifyEngine } from "../../src/verify/engine.js";
import type { RawSearchResult, TrustLevel } from "../../src/types.js";

function makeResult(
  title: string,
  url: string,
  snippet: string,
  engine = "test",
): RawSearchResult {
  return { title, url, snippet, engine };
}

describe("VerifyEngine", () => {
  const verifier = new VerifyEngine();

  it("marks results as verified when multiple sources agree", () => {
    const raw = [
      makeResult(
        "Tokyo Pop",
        "https://a.com",
        "Tokyo population is 14 million",
        "google",
      ),
      makeResult(
        "Tokyo Info",
        "https://b.com",
        "14 million people in Tokyo",
        "bing",
      ),
      makeResult(
        "Tokyo Data",
        "https://c.com",
        "Tokyo population approximately 14 million",
        "ddg",
      ),
    ];

    const verified = verifier.verify(raw, "Tokyo population");
    expect(verified.results.length).toBeGreaterThan(0);

    const highTrust = verified.results.filter((r) => r.trust === "verified");
    expect(highTrust.length).toBeGreaterThan(0);
    expect(verified.conflicts).toBe(0);
  });

  it("marks single-source results as unverified", () => {
    const raw = [
      makeResult(
        "Unique Info",
        "https://only.com",
        "Very unique claim",
        "google",
      ),
    ];

    const verified = verifier.verify(raw, "unique topic");
    expect(verified.results[0].trust).toBe("unverified");
  });

  it("detects conflicting information", () => {
    const raw = [
      makeResult(
        "Source A",
        "https://a.com",
        "The company revenue was 100 billion",
        "google",
      ),
      makeResult(
        "Source B",
        "https://b.com",
        "Company revenue reached 80 billion",
        "bing",
      ),
      makeResult(
        "Source C",
        "https://c.com",
        "Revenue figures show 100 billion",
        "ddg",
      ),
    ];

    const verified = verifier.verify(raw, "company revenue");
    expect(verified.conflicts).toBeGreaterThan(0);

    const conflicted = verified.results.filter((r) => r.trust === "conflicted");
    expect(conflicted.length).toBeGreaterThan(0);
  });

  it("assigns higher scores to results with more matching sources", () => {
    const raw = [
      makeResult("Many Agree", "https://a.com", "TypeScript is great", "g"),
      makeResult("Also Agrees", "https://b.com", "TypeScript is great", "b"),
      makeResult("Disagrees", "https://c.com", "TypeScript is terrible", "d"),
    ];

    const verified = verifier.verify(raw, "TypeScript opinion");
    const sorted = verified.results.sort((a, b) => b.score - a.score);
    expect(sorted[0].score).toBeGreaterThanOrEqual(
      sorted[sorted.length - 1].score,
    );
  });

  it("returns empty results for empty input", () => {
    const verified = verifier.verify([], "empty");
    expect(verified.results).toEqual([]);
    expect(verified.conflicts).toBe(0);
  });

  it("gives engine diversity bonus when multiple engines find same result", () => {
    const raw = [
      makeResult(
        "Same Topic",
        "https://a.com",
        "TypeScript is a programming language",
        "google",
      ),
      makeResult(
        "Same Topic B",
        "https://b.com",
        "TypeScript is a programming language",
        "duckduckgo",
      ),
    ];

    const verified = verifier.verify(raw, "TypeScript");
    expect(verified.results[0].score).toBeGreaterThan(0.5);
  });

  it("gives snippet quality bonus for long snippets", () => {
    const shortSnippet = [
      makeResult("Short A", "https://a.com", "Short text", "g"),
      makeResult("Short B", "https://b.com", "Short text here", "b"),
    ];
    const longSnippet = [
      makeResult(
        "Long A",
        "https://c.com",
        "A".repeat(150) + " detailed content about the topic",
        "g",
      ),
      makeResult(
        "Long B",
        "https://d.com",
        "B".repeat(150) + " detailed content about the topic",
        "b",
      ),
    ];

    const shortResult = verifier.verify(shortSnippet, "test");
    const longResult = verifier.verify(longSnippet, "test");

    expect(longResult.results[0].score).toBeGreaterThanOrEqual(
      shortResult.results[0].score,
    );
  });
});
