import { Command } from "commander";
import { KaguraSearch } from "@kagura/core";
import type { Platform } from "@kagura/core";
import { formatResult, formatMeta } from "./formatter.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
);

export function createProgram(): Command {
  const program = new Command();

  program
    .name("kagura")
    .description("Kagura Search - truth-illuminating search engine")
    .version(pkg.version)
    .argument("<query>", "Search query")
    .option(
      "-p, --platform <platform>",
      "Target platform (twitter, reddit, youtube, etc.)",
    )
    .option("-d, --deep", "Enable deep verification mode")
    .option(
      "-f, --format <format>",
      "Output format (text, json, markdown)",
      "text",
    )
    .option("-n, --max-results <n>", "Maximum results", "10")
    .action(async (query: string, opts) => {
      const VALID_PLATFORMS = new Set([
        "web",
        "twitter",
        "reddit",
        "youtube",
        "instagram",
        "tiktok",
        "github",
      ]);

      if (opts.platform && !VALID_PLATFORMS.has(opts.platform)) {
        console.error(
          `Error: unknown platform "${opts.platform}". Valid: ${[...VALID_PLATFORMS].join(", ")}`,
        );
        process.exitCode = 1;
        return;
      }

      const maxResults = parseInt(opts.maxResults, 10);
      const kagura = new KaguraSearch({
        deep: opts.deep,
        maxResults:
          Number.isFinite(maxResults) && maxResults >= 1 ? maxResults : 10,
      });

      const platform = opts.platform as Platform | undefined;

      // Don't manually prepend site: — kagura.search() handles it via platform option
      const response = await kagura.search(query, {
        platform,
        deep: opts.deep,
        maxResults:
          Number.isFinite(maxResults) && maxResults >= 1 ? maxResults : 10,
      });

      if (opts.format === "json") {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      if (opts.format === "markdown") {
        console.log(`# Kagura Search Results\n`);
        console.log(
          `> ${response.meta.totalResults} results from ${response.meta.engines.join(", ")} in ${response.meta.searchTimeMs}ms\n`,
        );
        for (const result of response.results) {
          const trustBadge =
            result.trust === "verified"
              ? "verified"
              : result.trust === "conflicted"
                ? "conflicted"
                : "unverified";
          console.log(`## [${result.title}](${result.source})\n`);
          console.log(
            `**Trust:** ${trustBadge} (${result.score.toFixed(2)}) | **Sources:** ${result.matchedSources}\n`,
          );
          console.log(`${result.content}\n`);
        }
        return;
      }

      console.log(`\n\x1b[1mKagura Search v${pkg.version}\x1b[0m`);
      console.log(`${"=".repeat(40)}`);
      console.log(formatMeta(response.meta));
      console.log("");

      if (response.results.length === 0) {
        console.log("No results found.");
        return;
      }

      for (const result of response.results) {
        console.log(formatResult(result));
        console.log("");
      }
    });

  return program;
}
