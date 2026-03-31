import type { RawSearchResult, SearchResult } from "../types.js";
import {
  calculateSimilarity,
  determineTrust,
  extractNumbers,
  detectNumberConflict,
} from "./trust.js";

interface VerifyResult {
  results: SearchResult[];
  conflicts: number;
}

export class VerifyEngine {
  private readonly SIMILARITY_THRESHOLD = 0.3;

  verify(raw: RawSearchResult[], query: string, minSources = 2): VerifyResult {
    if (raw.length === 0) return { results: [], conflicts: 0 };

    const groups = this.groupSimilar(raw);
    let totalConflicts = 0;

    const results: SearchResult[] = [];
    for (const group of groups) {
      const hasConflict = this.checkConflicts(group);
      if (hasConflict) totalConflicts++;

      // Count independent sources by distinct domains, not raw result count
      const independentCount = this.countIndependentSources(group);
      const { trust, score } = determineTrust(
        independentCount,
        raw.length,
        hasConflict,
        minSources,
      );

      const primary = group[0];
      results.push({
        title: primary.title,
        source: primary.url,
        content: primary.snippet,
        trust,
        score,
        matchedSources: group.length,
      });
    }

    return { results, conflicts: totalConflicts };
  }

  private groupSimilar(results: RawSearchResult[]): RawSearchResult[][] {
    const groups: RawSearchResult[][] = [];
    const assigned = new Set<number>();

    for (let i = 0; i < results.length; i++) {
      if (assigned.has(i)) continue;

      const group = [results[i]];
      assigned.add(i);

      for (let j = i + 1; j < results.length; j++) {
        if (assigned.has(j)) continue;
        const sim = calculateSimilarity(results[i].snippet, results[j].snippet);
        if (sim >= this.SIMILARITY_THRESHOLD) {
          group.push(results[j]);
          assigned.add(j);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  private countIndependentSources(group: RawSearchResult[]): number {
    const domains = new Set<string>();
    for (const r of group) {
      try {
        const domain = new URL(r.url).hostname.replace(/^www\./, "");
        domains.add(domain);
      } catch {
        domains.add(r.url);
      }
    }
    return domains.size;
  }

  private checkConflicts(group: RawSearchResult[]): boolean {
    if (group.length < 2) return false;

    for (let i = 0; i < group.length; i++) {
      const numsI = extractNumbers(group[i].snippet);
      for (let j = i + 1; j < group.length; j++) {
        const numsJ = extractNumbers(group[j].snippet);
        if (detectNumberConflict(numsI, numsJ)) return true;
      }
    }
    return false;
  }
}
