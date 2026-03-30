import { describe, it, expect } from "vitest";
import {
  loadConfig,
  getDefaultConfig,
  resolveEnvValue,
} from "../src/config.js";

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
