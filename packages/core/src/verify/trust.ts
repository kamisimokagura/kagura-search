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
): { trust: TrustLevel; score: number } {
  if (hasContradiction) {
    return { trust: "conflicted", score: 0.3 };
  }
  if (matchCount >= 2) {
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
  for (const a of numbersA) {
    for (const b of numbersB) {
      if (a > 0 && b > 0) {
        const ratio = Math.max(a, b) / Math.min(a, b);
        if (ratio > 1.15 && ratio < 10) return true;
      }
    }
  }
  return false;
}
