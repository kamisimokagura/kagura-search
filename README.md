# Kagura Search

> Truth-illuminating search engine with multi-source verification

[![Version](https://img.shields.io/github/v/release/kamisimokagura/kagura-search?label=version)](https://github.com/kamisimokagura/kagura-search/releases)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-167%20passed-brightgreen.svg)](#development)

Kagura Search queries multiple search engines in parallel, cross-checks results for contradictions, and labels every result with a trust level. It works as a **CLI** and as an **MCP server** for 90+ AI tools -- no API keys required to start.

## Why Kagura?

Most search tools return a flat list from a single engine. Kagura does three things differently:

1. **Multi-provider racing** -- SearXNG, DuckDuckGo, Brave, and Google run in parallel. The fastest results win; slow providers don't block you.
2. **Trust verification** -- Results from 2+ independent sources are marked `verified`. Conflicting numbers are flagged as `conflicted`. Single-source results stay `unverified`.
3. **Security pipeline** -- Prompt injection detection on input AND output. SSRF protection. Zero-width character stripping.

## Quick Start

### CLI

```bash
npx @kagura/search-tool "TypeScript best practices"
```

### MCP Server (for AI tools)

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

Works with Claude Code, Cursor, VS Code Copilot, Codex CLI, Gemini CLI, and any MCP-compatible tool.

```bash
# Claude Code shortcut
claude mcp add kagura -- npx @kagura/mcp
```

### Docker (self-hosted SearXNG)

```bash
cd docker && docker compose up -d
```

This gives you a private SearXNG instance at `localhost:8888` -- no queries leak to public engines.

## Architecture

```
User Query
    |
    v
[InputGuard] -- Prompt injection detection, malicious intent blocking
    |
    v
[SearchEngine] -- Parallel racing across all providers
    |  +-- SearXNG Pool (8 public instances, racing)
    |  +-- DuckDuckGo (JSON API + HTML fallback)
    |  +-- Brave HTML (scraper)
    |  +-- Google HTML (scraper)
    |  +-- Brave API (optional, needs key)
    |  +-- Jina Search (opt-in)
    |
    v
[VerifyEngine] -- Cross-source grouping, conflict detection, trust scoring
    |
    v
[OutputShield] -- PI stripping, URL validation, zero-width removal
    |
    v
Verified Results: [verified] [unverified] [conflicted]
```

## CLI Usage

```bash
# Basic search
kagura "TypeScript best practices"

# Platform-specific search
kagura "Claude Code tips" -p twitter
kagura "machine learning papers" -p reddit

# Deep verification mode (only verified/conflicted results)
kagura "Tokyo population 2026" -d

# JSON output (for scripting)
kagura "React vs Vue" -f json

# Limit results
kagura "machine learning" -n 5
```

## MCP Tools

| Tool              | Description                               |
| ----------------- | ----------------------------------------- |
| `kagura_search`   | Web search with trust scoring             |
| `kagura_discover` | URL discovery (titles + snippets)         |
| `kagura_extract`  | Markdown content extraction via Jina      |
| `kagura_verify`   | Cross-verify a specific claim             |
| `kagura_platform` | Platform-optimized search (Twitter, etc.) |

## Providers

Kagura ships with 6 search providers. All run in parallel (racing); the fastest non-empty response wins.

| Provider    | API Key | How it works                              | Default |
| ----------- | ------- | ----------------------------------------- | ------- |
| SearXNG     | No      | 8 public instances racing, JSON API       | Enabled |
| DuckDuckGo  | No      | JSON API (general) + HTML scraper (site:) | Enabled |
| Brave HTML  | No      | HTML scraper                              | Enabled |
| Google HTML | No      | HTML scraper                              | Enabled |
| Brave API   | Yes     | Official API, most reliable               | Opt-in  |
| Jina Search | No      | s.jina.ai, sends queries externally       | Opt-in  |

### Reliability Note

Public scrapers (SearXNG, Brave HTML, Google HTML) are subject to rate limiting and availability changes by the upstream services. This is inherent to any tool that scrapes public search engines -- not specific to Kagura.

**For stable, production use:**

- Run your own SearXNG instance (see [Docker setup](#docker-self-hosted-searxng))
- Add a [Brave Search API key](https://brave.com/search/api/) (free tier available)
- Both options eliminate dependence on public instance availability

Every provider includes a **RateLimitBreaker** (circuit breaker with exponential backoff: 30s -> 60s -> 120s -> max 300s) so a tripped provider recovers automatically once the upstream service is available again.

## Configuration

Create `~/.kagura/config.json`:

```json
{
  "providers": {
    "searxng": {
      "baseUrl": "http://localhost:8888"
    },
    "brave-api": {
      "apiKey": "env:BRAVE_API_KEY",
      "enabled": true
    }
  },
  "maxResults": 10,
  "timeout": 5000
}
```

### Privacy Mode

If you run a private SearXNG instance, disable public providers to prevent query leakage:

```json
{
  "providers": {
    "searxng": { "baseUrl": "http://my-private-searxng:8888" },
    "duckduckgo": { "enabled": false },
    "brave": { "enabled": false },
    "google": { "enabled": false }
  }
}
```

**Fail-closed behavior:** If you configure `"baseUrl": "env:SEARXNG_URL"` and the environment variable is missing, ALL public providers are automatically suppressed. No silent fallback to public engines.

## Trust Levels

| Level        | Meaning                                      |
| ------------ | -------------------------------------------- |
| `verified`   | 2+ independent sources agree                 |
| `unverified` | Single source only -- verify before trusting |
| `conflicted` | Sources disagree (e.g., different numbers)   |

## Security

4-layer defense-in-depth:

1. **InputGuard** -- Blocks prompt injection (5 patterns), role override, system prompt extraction
2. **Malicious intent detection** -- Blocks stalking, hacking, and harmful queries
3. **OutputShield** -- Strips PI patterns and zero-width characters from results
4. **Source validation** -- Every result must have a valid, non-internal URL

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run all tests (167 tests)
npm run test

# Dev mode (watch)
npm run dev
```

### Project Structure

```
kagura-search/
+-- packages/
|   +-- core/     # Search engine, providers, security, verification
|   +-- cli/      # Command-line interface
|   +-- mcp/      # MCP server (5 tools)
+-- docker/       # Docker Compose + SearXNG config
+-- turbo.json    # Turborepo config
```

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Run `npm test` (all 167 tests must pass)
5. Submit a pull request

## License

[MIT](LICENSE)
