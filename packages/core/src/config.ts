import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { KaguraConfig, SearchProviderConfig } from "./types.js";

export function getDefaultConfig(): Required<
  Pick<KaguraConfig, "providers" | "deep" | "maxResults" | "timeout">
> &
  KaguraConfig {
  return {
    providers: {},
    deep: false,
    maxResults: 10,
    timeout: 5000,
  };
}

export function resolveEnvValue(value: string): string | undefined {
  if (value.startsWith("env:")) {
    const envKey = value.slice(4);
    return process.env[envKey];
  }
  return value;
}

/**
 * Load config from ~/.kagura/config.json if it exists.
 * Returns an empty partial config if the file is missing or invalid.
 */
export function loadConfigFromFile(): Partial<KaguraConfig> {
  try {
    const configPath = join(homedir(), ".kagura", "config.json");
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as Partial<KaguraConfig>;
  } catch {
    // File doesn't exist or is invalid JSON — return empty config
    return {};
  }
}

/**
 * Iterate over all providers and resolve any `env:` prefixed values
 * in apiKey and baseUrl fields. Also applies SEARXNG_URL env fallback.
 */
export function resolveProviderEnvValues(config: KaguraConfig): KaguraConfig {
  const resolvedProviders: Record<string, SearchProviderConfig> = {};

  for (const [name, provider] of Object.entries(config.providers)) {
    const resolved: SearchProviderConfig = { ...provider };

    if (resolved.apiKey) {
      // If env var is unset, clear the field rather than keeping "env:..." as a literal
      resolved.apiKey = resolveEnvValue(resolved.apiKey);
    }
    if (resolved.baseUrl) {
      const original = resolved.baseUrl;
      resolved.baseUrl = resolveEnvValue(resolved.baseUrl);
      // If an env: baseUrl reference was explicitly configured but unresolved,
      // mark the provider so buildProviders() can fail closed for public-fallback
      // providers. Skip if the provider is already manually disabled (enabled=false)
      // to avoid false fail-closed triggers on intentional disables.
      if (
        original.startsWith("env:") &&
        !resolved.baseUrl &&
        resolved.enabled !== false
      ) {
        (resolved as Record<string, unknown>)._envBaseUrlFailed = true;
      }
    }

    resolvedProviders[name] = resolved;
  }

  // Fallback: check SEARXNG_URL env even when no searxng provider is configured
  const envUrl = process.env.SEARXNG_URL;
  if (envUrl) {
    if (!resolvedProviders.searxng) {
      resolvedProviders.searxng = { baseUrl: envUrl };
    } else if (!resolvedProviders.searxng.baseUrl) {
      resolvedProviders.searxng = {
        ...resolvedProviders.searxng,
        baseUrl: envUrl,
      };
    }
  }

  return { ...config, providers: resolvedProviders };
}

export function loadConfig(userConfig?: Partial<KaguraConfig>): KaguraConfig {
  const defaults = getDefaultConfig();
  const fileConfig = loadConfigFromFile();

  // Deep-merge providers so that overriding one field doesn't drop the rest
  const allProviderNames = new Set([
    ...Object.keys(defaults.providers),
    ...Object.keys(fileConfig.providers ?? {}),
    ...Object.keys(userConfig?.providers ?? {}),
  ]);
  const mergedProviders: Record<string, SearchProviderConfig> = {};
  for (const name of allProviderNames) {
    mergedProviders[name] = {
      ...defaults.providers[name],
      ...fileConfig.providers?.[name],
      ...userConfig?.providers?.[name],
    };
  }

  const merged: KaguraConfig = {
    ...defaults,
    ...fileConfig,
    ...userConfig,
    providers: mergedProviders,
  };

  return resolveProviderEnvValues(merged);
}
