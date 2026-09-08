import "server-only";

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type HonchoConfig = {
  apiKey: string;
  baseUrl: string;
  workspace: string | null;
  isRemote: boolean;
};

type ResolveHonchoConfigInput = {
  env: Record<string, string | undefined>;
  fileConfig?: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
}

export function resolveHonchoConfig({
  env,
  fileConfig,
}: ResolveHonchoConfigInput): HonchoConfig {
  const config = record(fileConfig);
  const hosts = record(config.hosts);
  const host = record(hosts.hermes);
  const apiKey = stringValue(
    env.HONCHO_API_KEY,
    host.apiKey,
    host.api_key,
  );
  const baseUrl = stringValue(
    env.HONCHO_BASE_URL,
    config.base_url,
    config.baseUrl,
    host.base_url,
    host.baseUrl,
  );
  const workspace = stringValue(
    env.HONCHO_WORKSPACE,
    host.workspace_id,
    host.workspaceId,
    host.workspace,
  );

  if (!apiKey || !baseUrl) {
    throw new Error("Honcho connection settings are incomplete.");
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  let endpoint: URL;
  try {
    endpoint = new URL(normalizedBaseUrl);
  } catch {
    throw new Error("Honcho base URL is invalid.");
  }

  if (
    !["http:", "https:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/"
  ) {
    throw new Error("Honcho base URL must be an origin without credentials, query, path, or fragment.");
  }

  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  const remoteAllowed = env.HONCHO_ALLOW_REMOTE?.toLowerCase() === "true";
  if (!loopbackHosts.has(endpoint.hostname) && !remoteAllowed) {
    throw new Error("Honcho base URL must use a loopback host.");
  }

  return {
    apiKey,
    baseUrl: normalizedBaseUrl,
    workspace: workspace ?? null,
    isRemote: !loopbackHosts.has(endpoint.hostname),
  };
}

type LoadHonchoConfigInput = {
  configPath?: string;
  env?: Record<string, string | undefined>;
};

export async function loadHonchoConfig({
  configPath,
  env = process.env,
}: LoadHonchoConfigInput = {}): Promise<HonchoConfig> {
  const path = configPath ?? env.HONCHO_CONFIG_PATH ?? join(homedir(), ".honcho", "config.json");
  let fileConfig: unknown = {};

  try {
    fileConfig = JSON.parse(await readFile(/* turbopackIgnore: true */ path, "utf8")) as unknown;
  } catch (error) {
    if (!env.HONCHO_API_KEY || !env.HONCHO_BASE_URL) {
      const detail = error instanceof Error ? error.message : "unknown read error";
      throw new Error(`Unable to read Honcho configuration: ${detail}`);
    }
  }

  return resolveHonchoConfig({ env, fileConfig });
}
