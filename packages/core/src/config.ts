import type { KaguraConfig } from "./types.js";

export function getDefaultConfig(): Required<
  Pick<KaguraConfig, "providers" | "deep" | "maxResults" | "timeout">
> &
  KaguraConfig {
  return {
    providers: {},
    deep: false,
    maxResults: 10,
    timeout: 10000,
  };
}

export function resolveEnvValue(value: string): string | undefined {
  if (value.startsWith("env:")) {
    const envKey = value.slice(4);
    return process.env[envKey];
  }
  return value;
}

export function loadConfig(userConfig?: Partial<KaguraConfig>): KaguraConfig {
  const defaults = getDefaultConfig();
  if (!userConfig) return defaults;

  return {
    ...defaults,
    ...userConfig,
    providers: {
      ...defaults.providers,
      ...userConfig.providers,
    },
  };
}
