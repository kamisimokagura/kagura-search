import { describe, it, expect, vi, afterEach } from "vitest";
import {
  loadConfig,
  getDefaultConfig,
  resolveEnvValue,
  loadConfigFromFile,
  resolveProviderEnvValues,
} from "../src/config.js";
import type { KaguraConfig } from "../src/types.js";

describe("config", () => {
  it("getDefaultConfig returns valid defaults", () => {
    const config = getDefaultConfig();
    expect(config.providers).toEqual({});
    expect(config.maxResults).toBe(10);
    expect(config.timeout).toBe(10000);
    expect(config.deep).toBe(false);
  });

  it("resolveEnvValue resolves env: prefix", () => {
    process.env.TEST_KEY = "secret123";
    expect(resolveEnvValue("env:TEST_KEY")).toBe("secret123");
    delete process.env.TEST_KEY;
  });

  it("resolveEnvValue returns literal for non-env values", () => {
    expect(resolveEnvValue("literal-value")).toBe("literal-value");
  });

  it("resolveEnvValue returns undefined for missing env var", () => {
    expect(resolveEnvValue("env:NONEXISTENT_VAR")).toBeUndefined();
  });

  it("loadConfig merges user config with defaults", () => {
    const userConfig = {
      providers: { searxng: { baseUrl: "http://localhost:8888" } },
      maxResults: 20,
    };
    const config = loadConfig(userConfig);
    expect(config.maxResults).toBe(20);
    expect(config.timeout).toBe(10000);
    expect(config.providers.searxng?.baseUrl).toBe("http://localhost:8888");
  });

  it("deep-merges provider fields instead of replacing", () => {
    const config = loadConfig({
      providers: {
        searxng: { enabled: false, baseUrl: "http://original:8080" },
      },
    });
    // Override baseUrl via a second merge layer
    const config2 = loadConfig({
      providers: {
        searxng: {
          baseUrl: "http://new:9090",
          enabled: false,
        },
      },
    });
    // enabled should still be present even when baseUrl is overridden
    expect(config2.providers.searxng?.enabled).toBe(false);
    expect(config2.providers.searxng?.baseUrl).toBe("http://new:9090");
  });

  it("loads brave provider config", () => {
    const config = loadConfig({
      providers: {
        brave: { enabled: true },
      },
    });
    expect(config.providers.brave).toBeDefined();
    expect(config.providers.brave?.enabled).toBe(true);
  });

  it("loads brave API key from env: prefix", () => {
    process.env.TEST_BRAVE_KEY = "test-api-key";
    const config = loadConfig({
      providers: {
        "brave-api": { apiKey: "env:TEST_BRAVE_KEY" },
      },
    });
    expect(config.providers["brave-api"]?.apiKey).toBe("test-api-key");
    delete process.env.TEST_BRAVE_KEY;
  });

  it("loads cache config", () => {
    const config = loadConfig({ cache: { maxEntries: 50, ttlMs: 60000 } });
    expect(config.cache?.maxEntries).toBe(50);
    expect(config.cache?.ttlMs).toBe(60000);
  });

  it("loads SearXNG instances array", () => {
    const config = loadConfig({
      providers: {
        searxng: {
          instances: ["https://a.example", "https://b.example"],
        },
      },
    });
    expect(
      (config.providers.searxng as Record<string, unknown>)?.instances,
    ).toEqual(["https://a.example", "https://b.example"]);
  });
});

describe("loadConfigFromFile", () => {
  it("returns empty defaults when config file does not exist", () => {
    // loadConfigFromFile reads ~/.kagura/config.json which won't exist in test
    const result = loadConfigFromFile();
    expect(result).toEqual({});
  });
});

describe("resolveProviderEnvValues", () => {
  afterEach(() => {
    delete process.env.MY_API_KEY;
    delete process.env.MY_BASE_URL;
    delete process.env.SEARXNG_URL;
  });

  it("resolves env: prefixed apiKey and baseUrl", () => {
    process.env.MY_API_KEY = "resolved-key";
    process.env.MY_BASE_URL = "https://resolved.example.com";

    const config: KaguraConfig = {
      providers: {
        brave: {
          apiKey: "env:MY_API_KEY",
          baseUrl: "env:MY_BASE_URL",
        },
      },
    };

    const resolved = resolveProviderEnvValues(config);
    expect(resolved.providers.brave?.apiKey).toBe("resolved-key");
    expect(resolved.providers.brave?.baseUrl).toBe(
      "https://resolved.example.com",
    );
  });

  it("keeps literal values unchanged", () => {
    const config: KaguraConfig = {
      providers: {
        brave: {
          apiKey: "literal-key",
          baseUrl: "https://literal.example.com",
        },
      },
    };

    const resolved = resolveProviderEnvValues(config);
    expect(resolved.providers.brave?.apiKey).toBe("literal-key");
    expect(resolved.providers.brave?.baseUrl).toBe(
      "https://literal.example.com",
    );
  });

  it("falls back to SEARXNG_URL env for searxng provider without baseUrl", () => {
    process.env.SEARXNG_URL = "http://env-searxng:8080";

    const config: KaguraConfig = {
      providers: {
        searxng: { enabled: true },
      },
    };

    const resolved = resolveProviderEnvValues(config);
    expect(resolved.providers.searxng?.baseUrl).toBe("http://env-searxng:8080");
  });

  it("auto-creates searxng provider from SEARXNG_URL when providers is empty", () => {
    process.env.SEARXNG_URL = "http://auto-created:8080";

    const config: KaguraConfig = {
      providers: {},
    };

    const resolved = resolveProviderEnvValues(config);
    expect(resolved.providers.searxng?.baseUrl).toBe(
      "http://auto-created:8080",
    );
  });

  it("does not override explicit searxng baseUrl with SEARXNG_URL env", () => {
    process.env.SEARXNG_URL = "http://env-searxng:8080";

    const config: KaguraConfig = {
      providers: {
        searxng: { baseUrl: "http://explicit:9090" },
      },
    };

    const resolved = resolveProviderEnvValues(config);
    expect(resolved.providers.searxng?.baseUrl).toBe("http://explicit:9090");
  });

  it("marks provider with _envBaseUrlFailed when env: baseUrl is unresolved", () => {
    delete process.env.UNSET_SEARXNG_URL;

    const config: KaguraConfig = {
      providers: {
        searxng: { baseUrl: "env:UNSET_SEARXNG_URL" },
      },
    };

    const resolved = resolveProviderEnvValues(config);
    expect(resolved.providers.searxng?.baseUrl).toBeUndefined();
    expect(
      (resolved.providers.searxng as Record<string, unknown>)
        ?._envBaseUrlFailed,
    ).toBe(true);
    // enabled should NOT be set to false — that's reserved for manual disable
    expect(resolved.providers.searxng?.enabled).toBeUndefined();
  });

  it("clears unresolved env: apiKey without disabling", () => {
    delete process.env.UNSET_API_KEY;

    const config: KaguraConfig = {
      providers: {
        brave: { apiKey: "env:UNSET_API_KEY" },
      },
    };

    const resolved = resolveProviderEnvValues(config);
    expect(resolved.providers.brave?.apiKey).toBeUndefined();
    // enabled should NOT be auto-set — only baseUrl triggers fail-closed
    expect(resolved.providers.brave?.enabled).toBeUndefined();
  });
});
