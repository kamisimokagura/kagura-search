#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { KaguraSearch, InputGuard, OutputShield } from "@kagura/core";
import type { Platform } from "@kagura/core";
import { JinaExtractor } from "@kagura/core";
import { TOOL_DEFINITIONS } from "./tools.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
);

const VALID_PLATFORMS = new Set([
  "twitter",
  "reddit",
  "youtube",
  "instagram",
  "tiktok",
  "github",
]);

const kagura = new KaguraSearch();
const inputGuard = new InputGuard();

const server = new Server(
  { name: "kagura-search", version: pkg.version },
  { capabilities: { tools: {} } },
);

function errorResponse(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

function requireString(
  args: Record<string, unknown> | undefined,
  key: string,
): string | null {
  if (!args || typeof args[key] !== "string") return null;
  const value = (args[key] as string).trim();
  if (value.length === 0) return null;
  return value;
}

function optionalNumber(
  args: Record<string, unknown> | undefined,
  key: string,
  max = 1000,
): number | undefined {
  if (!args || args[key] === undefined || args[key] === null) return undefined;
  const n = Number(args[key]);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(Math.floor(n), max);
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "kagura_search": {
      const query = requireString(args, "query");
      if (!query) return errorResponse("Missing required argument: query");

      const response = await kagura.search(query, {
        maxResults: optionalNumber(args, "maxResults"),
        deep: args?.deep === true ? true : undefined,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    case "kagura_verify": {
      const claim = requireString(args, "claim");
      if (!claim) return errorResponse("Missing required argument: claim");

      const sources = optionalNumber(args, "sources");
      const response = await kagura.verify(claim, sources);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    case "kagura_platform": {
      const query = requireString(args, "query");
      if (!query) return errorResponse("Missing required argument: query");
      const platform = requireString(args, "platform");
      if (!platform || !VALID_PLATFORMS.has(platform)) {
        return errorResponse(
          `Invalid platform. Must be one of: ${[...VALID_PLATFORMS].join(", ")}`,
        );
      }

      // Don't manually prepend site: — kagura.search() handles it via platform option
      const response = await kagura.search(query, {
        platform: platform as Platform,
        maxResults: optionalNumber(args, "maxResults"),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    case "kagura_discover": {
      const query = requireString(args, "query");
      if (!query) return errorResponse("Missing required argument: query");

      // Use raw discover to return all URLs before verification grouping,
      // so multiple pages about the same topic are not collapsed into one
      const raw = await kagura.discover(
        query,
        optionalNumber(args, "maxResults"),
      );
      // Sanitize titles through OutputShield to strip PI from untrusted results
      const shield = new OutputShield();
      const urls = raw
        .map((r) => {
          const sanitized = shield.protect([
            {
              title: r.title,
              source: r.url,
              content: r.snippet,
              trust: "unverified" as const,
              score: 0,
              matchedSources: 0,
            },
          ]);
          // If OutputShield rejected the URL (private/invalid), drop the result entirely
          if (sanitized.length === 0) return null;
          return {
            title: sanitized[0].title,
            url: sanitized[0].source,
            snippet: sanitized[0].content,
            engine: r.engine,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      return {
        content: [{ type: "text", text: JSON.stringify(urls, null, 2) }],
      };
    }

    case "kagura_extract": {
      const url = requireString(args, "url");
      if (!url) return errorResponse("Missing required argument: url");

      const urlCheck = inputGuard.validateUrl(url);
      if (urlCheck.blocked) {
        return errorResponse(`URL blocked: ${urlCheck.reason}`);
      }

      const jina = new JinaExtractor();
      const rawContent = await jina.extract(url);
      if (!rawContent) {
        return errorResponse("Failed to extract content from URL.");
      }
      // Sanitize extracted content through OutputShield to strip PI and zero-width chars
      const shield = new OutputShield();
      const sanitized = shield.protect([
        {
          title: "",
          source: url,
          content: rawContent,
          trust: "unverified" as const,
          score: 0,
          matchedSources: 0,
        },
      ]);
      return {
        content: [
          {
            type: "text",
            text: sanitized.length > 0 ? sanitized[0].content : rawContent,
          },
        ],
      };
    }

    default:
      return errorResponse(`Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
