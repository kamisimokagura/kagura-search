import { Command } from "commander";
import { KaguraSearch } from "@kagura/core";
import type { Platform } from "@kagura/core";
import { formatResult, formatMeta } from "./formatter.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("kagura")
    .description("Kagura Search - truth-illuminating search engine")
    .version("0.1.0")
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
      const kagura = new KaguraSearch({
        deep: opts.deep,
        maxResults: parseInt(opts.maxResults, 10),
      });

      const platform = opts.platform as Platform | undefined;
      const searchQuery = platform
        ? `${query} site:${platformToSite(platform)}`
        : query;

      const response = await kagura.search(searchQuery, {
        platform,
        deep: opts.deep,
        maxResults: parseInt(opts.maxResults, 10),
      });

      if (opts.format === "json") {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      console.log(`\n\x1b[1mKagura Search v0.1.0\x1b[0m`);
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

function platformToSite(platform: Platform): string {
  const map: Record<Platform, string> = {
    web: "",
    twitter: "x.com",
    reddit: "reddit.com",
    youtube: "youtube.com",
    instagram: "instagram.com",
    tiktok: "tiktok.com",
    github: "github.com",
  };
  return map[platform] ?? "";
}
