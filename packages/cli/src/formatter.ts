import type { SearchResult, SearchMeta } from "@kagura/core";

const TRUST_ICONS: Record<string, string> = {
  verified: "\x1b[32m[verified]\x1b[0m",
  unverified: "\x1b[33m[unverified]\x1b[0m",
  conflicted: "\x1b[31m[conflicted]\x1b[0m",
};

export function formatResult(result: SearchResult): string {
  const icon = TRUST_ICONS[result.trust] ?? `[${result.trust}]`;
  const lines = [
    `${icon} ${result.title}`,
    `   ${result.content}`,
    `   \x1b[34m${result.source}\x1b[0m`,
  ];

  if (result.matchedSources > 1) {
    lines.push(`   (+${result.matchedSources - 1} sources agree)`);
  }

  if (result.trust === "unverified") {
    lines.push("   \x1b[33mSingle source - verify independently\x1b[0m");
  }

  return lines.join("\n");
}

export function formatMeta(meta: SearchMeta): string {
  const time = (meta.searchTimeMs / 1000).toFixed(1);
  const parts = [
    `${meta.engines.length} engines`,
    `${meta.totalResults} results`,
    `${meta.conflicts} conflicts`,
    `${time}s`,
  ];
  return parts.join(" | ");
}
