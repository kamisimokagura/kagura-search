import type { TrustLevel } from "../types.js";

export function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

export function determineTrust(
  matchCount: number,
  totalSources: number,
  hasContradiction: boolean,
  minSources = 2,
): { trust: TrustLevel; score: number } {
  if (hasContradiction) {
    return { trust: "conflicted", score: 0.3 };
  }
  if (matchCount >= minSources) {
    const score = Math.min(0.5 + (matchCount / totalSources) * 0.5, 1.0);
    return { trust: "verified", score };
  }
  return { trust: "unverified", score: 0.4 };
}

export function extractNumbers(text: string): number[] {
  const matches = text.match(/\d[\d,.]*\d|\d+/g);
  if (!matches) return [];
  return matches
    .map((m) => parseFloat(m.replace(/,/g, "")))
    .filter((n) => !isNaN(n) && n > 0);
}

export function detectNumberConflict(
  numbersA: number[],
  numbersB: number[],
): boolean {
  if (numbersA.length === 0 || numbersB.length === 0) return false;

  // For each number in A, find the closest match in B (same order of magnitude).
  // Only flag conflict when matched pairs disagree, avoiding false positives
  // from unrelated numbers (years, rankings, counts in different contexts).
  let matchedPairs = 0;
  let conflictingPairs = 0;

  for (const a of numbersA) {
    let bestMatch: number | null = null;
    let bestRatio = Infinity;

    for (const b of numbersB) {
      if (a <= 0 || b <= 0) continue;
      const ratio = Math.max(a, b) / Math.min(a, b);
      // Consider numbers within 10x of each other as potential matches
      if (ratio < 10 && ratio < bestRatio) {
        bestMatch = b;
        bestRatio = ratio;
      }
    }

    if (bestMatch !== null) {
      matchedPairs++;
      if (bestRatio > 1.15) {
        conflictingPairs++;
      }
    }
  }

  // Require at least one matched pair with any disagreement
  return matchedPairs >= 1 && conflictingPairs >= 1;
}

export function calculateQualityBonus(
  group: Array<{ snippet: string; engine: string }>,
): number {
  let bonus = 0;

  // Engine diversity bonus: different engines confirming same info
  const uniqueEngines = new Set(group.map((r) => r.engine));
  if (uniqueEngines.size >= 2) {
    bonus += 0.1;
  }

  // Snippet quality bonus: longer snippets = more informative
  const avgSnippetLength =
    group.reduce((sum, r) => sum + r.snippet.length, 0) / group.length;
  if (avgSnippetLength > 100) {
    bonus += 0.05;
  }

  return bonus;
}
