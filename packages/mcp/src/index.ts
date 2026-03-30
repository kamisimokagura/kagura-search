#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { KaguraSearch } from "@kagura/core";
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
      const response = await kagura.verify(args!.claim as string);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    case "kagura_platform": {
      const query = `${args!.query} site:${platformSite(args!.platform as string)}`;
      const response = await kagura.search(query, {
        platform: args!.platform as string,
        maxResults: args!.maxResults as number,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    case "kagura_discover": {
      const response = await kagura.search(args!.query as string, {
        maxResults: args!.maxResults as number,
      });
      const urls = response.results.map((r) => ({
        title: r.title,
        url: r.source,
        trust: r.trust,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(urls, null, 2) }],
      };
    }

    case "kagura_extract": {
      const jina = new JinaExtractor();
      const content = await jina.extract(args!.url as string);
      return {
        content: [
          {
            type: "text",
            text: content ?? "Failed to extract content from URL.",
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
