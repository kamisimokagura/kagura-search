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
});
