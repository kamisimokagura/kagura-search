export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "kagura_search",
    description:
      "Search the web with multi-source verification. Returns results with trust scores (verified/unverified/conflicted) and source URLs. Works across SearXNG and DuckDuckGo.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        maxResults: {
          type: "number",
          description: "Maximum results (default 10)",
        },
        deep: { type: "boolean", description: "Enable deep verification mode" },
      },
      required: ["query"],
    },
  },
  {
    name: "kagura_discover",
    description:
      "Discover URLs for a topic without extracting content. Returns a list of relevant URLs with titles and snippets from multiple search engines.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        maxResults: {
          type: "number",
          description: "Maximum results (default 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "kagura_extract",
    description:
      "Extract clean markdown content from a URL using Jina Reader. Returns the page content converted to readable markdown.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to extract content from" },
      },
      required: ["url"],
    },
  },
  {
    name: "kagura_verify",
    description:
      "Verify a claim by cross-checking it against multiple sources. Returns trust level and conflicting information if found.",
    inputSchema: {
      type: "object",
      properties: {
        claim: { type: "string", description: "The claim to verify" },
        sources: {
          type: "number",
          description:
            "Minimum independent sources to require for verified status (default 2)",
        },
      },
      required: ["claim"],
    },
  },
  {
    name: "kagura_platform",
    description:
      "Search a specific social media platform (Twitter/X, Reddit, YouTube, Instagram, TikTok, GitHub). Uses platform-optimized search strategies.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        platform: {
          type: "string",
          enum: [
            "twitter",
            "reddit",
            "youtube",
            "instagram",
            "tiktok",
            "github",
          ],
          description: "Target platform",
        },
        maxResults: {
          type: "number",
          description: "Maximum results (default 10)",
        },
      },
      required: ["query", "platform"],
    },
  },
];
