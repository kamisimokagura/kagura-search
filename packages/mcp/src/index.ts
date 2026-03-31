#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { KaguraSearch, OutputShield } from "@kagura/core";
import type { Platform } from "@kagura/core";
import { JinaExtractor } from "@kagura/core";
import { TOOL_DEFINITIONS } from "./tools.js";

const kagura = new KaguraSearch();

const server = new Server(
  { name: "kagura-search", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "kagura_search": {
      const response = await kagura.search(args!.query as string, {
        maxResults: args!.maxResults as number,
        deep: args!.deep as boolean,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    case "kagura_verify": {
      const sources = (args!.sources as number) ?? undefined;
      const response = await kagura.verify(args!.claim as string, sources);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    case "kagura_platform": {
      const query = `${args!.query} site:${platformSite(args!.platform as string)}`;
      const response = await kagura.search(query, {
        platform: args!.platform as Platform,
        maxResults: args!.maxResults as number,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    case "kagura_discover": {
      // Use raw discover to return all URLs before verification grouping,
      // so multiple pages about the same topic are not collapsed into one
      const raw = await kagura.discover(
        args!.query as string,
        args!.maxResults as number,
      );
      // Sanitize titles through OutputShield to strip PI from untrusted results
      const shield = new OutputShield();
      const urls = raw
        .filter((r) => /^https?:\/\//.test(r.url))
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
          return {
            title: sanitized[0]?.title ?? r.title,
            url: r.url,
            engine: r.engine,
          };
        });
      return {
        content: [{ type: "text", text: JSON.stringify(urls, null, 2) }],
      };
    }

    case "kagura_extract": {
      const jina = new JinaExtractor();
      const rawContent = await jina.extract(args!.url as string);
      if (!rawContent) {
        return {
          content: [
            { type: "text", text: "Failed to extract content from URL." },
          ],
        };
      }
      // Sanitize extracted content through OutputShield to strip PI and zero-width chars
      const shield = new OutputShield();
      const sanitized = shield.protect([
        {
          title: "",
          source: args!.url as string,
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
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  }
});

function platformSite(platform: string): string {
  const map: Record<string, string> = {
    twitter: "x.com",
    reddit: "reddit.com",
    youtube: "youtube.com",
    instagram: "instagram.com",
    tiktok: "tiktok.com",
    github: "github.com",
  };
  return map[platform] ?? "";
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
