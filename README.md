# Kagura Search

> Truth-illuminating open-source search engine with multi-source verification

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)

Kagura Search is an open-source search tool that **never lies**. It searches across multiple engines, cross-checks sources for contradictions, and labels every result with a trust level. Works with 90+ AI tools via MCP protocol -- zero API keys required.

## Features

- **4-Layer Security Pipeline**: InputGuard (PI detection) -> SearchEngine (multi-source) -> VerifyEngine (cross-check) -> OutputShield (output protection)
- **Trust Scoring**: Every result labeled as `verified`, `unverified`, or `conflicted`
- **Zero Config**: Works out of the box with SearXNG + DuckDuckGo (no API keys)
- **MCP Server**: 5 tools for any AI assistant (Claude Code, Cursor, VS Code, Codex, Gemini CLI)
- **CLI**: Beautiful terminal output with trust indicators
- **Platform Search**: Optimized strategies for Twitter/X, Reddit, YouTube, Instagram, TikTok, GitHub
- **Prompt Injection Defense**: Dual-layer PI detection on both input and output
- **Content Extraction**: Clean markdown via Jina Reader
- **Docker Ready**: Bundled SearXNG instance for self-hosted deployments

## Quick Start

### CLI

```bash
npx @kagura/search-tool "TypeScript best practices"
```

### MCP Server (for AI tools)

Add to your AI tool's MCP config:

```json
{
  "mcpServers": {
    "kagura": {
      "command": "npx",
      "args": ["@kagura/mcp"]
    }
  }
}
```

### Docker (self-hosted with SearXNG)

```bash
cd docker && docker compose up -d
```

## Architecture

```
+---------------------------------------------+
|                User Query                    |
+---------------------+-----------------------+
                      |
+---------------------v-----------------------+
|  Layer 1: InputGuard                        |
|  - Prompt injection detection (5 patterns)  |
|  - Malicious intent blocking                |
|  - HTML/script sanitization                 |
+---------------------+-----------------------+
                      |
+---------------------v-----------------------+
|  Layer 2: SearchEngine                      |
|  - Parallel multi-engine queries            |
|  - Tier-based fallback (0->1->2)            |
|  - URL deduplication                        |
|  +----------+ +-----------+ +------------+  |
|  | SearXNG  | |DuckDuckGo | | Jina Reader|  |
|  | (Tier 0) | | (Tier 0)  | | (Extract)  |  |
|  +----------+ +-----------+ +------------+  |
+---------------------+-----------------------+
                      |
+---------------------v-----------------------+
|  Layer 3: VerifyEngine                      |
|  - Cross-source similarity grouping         |
|  - Number conflict detection                |
|  - Trust level assignment                   |
+---------------------+-----------------------+
                      |
+---------------------v-----------------------+
|  Layer 4: OutputShield                      |
|  - Source URL validation                    |
|  - PI stripping from results                |
|  - Zero-width character removal             |
+---------------------+-----------------------+
                      |
+---------------------v-----------------------+
|           Verified Results                   |
|  [verified] [unverified] [conflicted]       |
+---------------------------------------------+
```

## CLI Usage

```bash
# Basic search
kagura "TypeScript best practices"

# Platform-specific search
kagura "Claude Code tips" -p twitter

# Deep verification mode
kagura "Tokyo population 2026" -d

# JSON output (for scripting)
kagura "React vs Vue" -f json

# Limit results
kagura "machine learning" -n 5
```

## MCP Tools

| Tool              | Description                    |
| ----------------- | ------------------------------ |
| `kagura_search`   | Web search with trust scoring  |
| `kagura_discover` | URL discovery (titles + trust) |
| `kagura_extract`  | Markdown content extraction    |
| `kagura_verify`   | Claim cross-verification       |
| `kagura_platform` | Platform-optimized search      |

### Setup for Popular AI Tools

**Claude Code:**

```bash
claude mcp add kagura -- npx @kagura/mcp
```

**Cursor / VS Code:**

```json
{
  "mcpServers": {
    "kagura": {
      "command": "npx",
      "args": ["@kagura/mcp"]
    }
  }
}
```

**Codex CLI:**

```json
{
  "mcpServers": {
    "kagura": {
      "command": "npx",
      "args": ["@kagura/mcp"]
    }
  }
}
```

## Configuration

Create `~/.kagura/config.json`:

```json
{
  "providers": {
    "searxng": {
      "baseUrl": "http://localhost:8888"
    }
  },
  "maxResults": 10,
  "timeout": 10000,
  "deep": false
}
```

### Provider Tiers

| Tier | Provider         | API Key Required |
| ---- | ---------------- | ---------------- |
| 0    | SearXNG          | No               |
| 0    | DuckDuckGo       | No               |
| 0    | Jina Reader      | No               |
| 1    | YouTube Data API | Free key         |
| 1    | GitHub Token     | Free             |
| 2    | Firecrawl        | Paid             |
| 2    | Brave Search     | Paid             |

## Trust Levels

- **verified**: 2+ independent sources agree on the same information
- **unverified**: Single source only -- verify independently before trusting
- **conflicted**: Sources disagree (e.g., different numbers for the same claim)

## Security

Kagura Search implements defense-in-depth:

1. **Input Validation**: Blocks prompt injection, role override, and system prompt extraction attempts
2. **Malicious Intent Detection**: Blocks stalking, hacking, and other harmful queries
3. **Output Sanitization**: Strips PI patterns and zero-width characters from search results
4. **Source Verification**: Every result must have a valid source URL

## Development

```bash
# Install
npm install

# Build all packages
npm run build

# Test all packages
npm run test

# Dev mode (watch)
npm run dev
```

## Project Structure

```
kagura-search/
├── packages/
│   ├── core/          # Search engine, security, verification
│   ├── cli/           # Command-line interface
│   └── mcp/           # MCP server for AI tools
├── docker/            # Docker + SearXNG setup
├── turbo.json         # Turborepo config
└── package.json       # Workspace root
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Submit a pull request

## License

[MIT](LICENSE) - Created by the Kagura Search Contributors
