import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadHonchoConfig, resolveHonchoConfig } from "./honcho-config";

describe("resolveHonchoConfig", () => {
  it("normalizes an explicit loopback configuration", () => {
    expect(
      resolveHonchoConfig({
        env: {
          HONCHO_API_KEY: "workspace-token",
          HONCHO_BASE_URL: "http://localhost:8000/",
          HONCHO_WORKSPACE: "oasis",
        },
      }),
    ).toEqual({
      apiKey: "workspace-token",
      baseUrl: "http://localhost:8000",
      workspace: "oasis",
      isRemote: false,
    });
  });

  it("loads camelCase and snake_case values from the Hermes host block", () => {
    expect(
      resolveHonchoConfig({
        env: {},
        fileConfig: {
          base_url: "http://127.0.0.1:8000/",
          hosts: {
            hermes: {
              apiKey: "workspace-token",
              workspace: "oasis",
            },
          },
        },
      }),
    ).toEqual({
      apiKey: "workspace-token",
      baseUrl: "http://127.0.0.1:8000",
      workspace: "oasis",
      isRemote: false,
    });
  });

  it("accepts a missing workspace so the UI can discover available workspaces", () => {
    expect(
      resolveHonchoConfig({
        env: {
          HONCHO_API_KEY: "workspace-token",
          HONCHO_BASE_URL: "http://127.0.0.1:8000",
        },
      }).workspace,
    ).toBeNull();
  });

  it("allows the workspace to be selected from the API when none is configured", () => {
    expect(
      resolveHonchoConfig({
        env: {
          HONCHO_API_KEY: "workspace-token",
          HONCHO_BASE_URL: "http://127.0.0.1:8000",
        },
      }),
    ).toEqual({
      apiKey: "workspace-token",
      baseUrl: "http://127.0.0.1:8000",
      workspace: null,
      isRemote: false,
    });
  });

  it("rejects a non-loopback endpoint unless remote mode is explicit", () => {
    expect(() =>
      resolveHonchoConfig({
        env: {
          HONCHO_API_KEY: "workspace-token",
          HONCHO_BASE_URL: "https://api.example.test",
          HONCHO_WORKSPACE: "oasis",
        },
      }),
    ).toThrow("loopback");
  });

  it("rejects credentials, query strings, paths, and fragments in the base URL", () => {
    expect(() =>
      resolveHonchoConfig({
        env: {
          HONCHO_API_KEY: "workspace-token",
          HONCHO_BASE_URL: "http://user:pass@localhost:8000/v3?token=secret#fragment",
          HONCHO_WORKSPACE: "oasis",
        },
      }),
    ).toThrow("origin");
  });

  it("marks an explicitly allowed non-loopback endpoint as remote", () => {
    expect(
      resolveHonchoConfig({
        env: {
          HONCHO_API_KEY: "workspace-token",
          HONCHO_BASE_URL: "https://api.example.test",
          HONCHO_ALLOW_REMOTE: "true",
          HONCHO_WORKSPACE: "oasis",
        },
      }),
    ).toMatchObject({
      baseUrl: "https://api.example.test",
      isRemote: true,
    });
  });
});

describe("loadHonchoConfig", () => {
  it("reads the existing local Honcho config when environment overrides are absent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "honcho-console-"));
    const configPath = join(directory, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        baseUrl: "http://127.0.0.1:8000",
        hosts: {
          hermes: {
            api_key: "file-token",
            workspace: "configured-space",
          },
        },
      }),
    );

    await expect(
      loadHonchoConfig({ configPath, env: {} }),
    ).resolves.toEqual({
      apiKey: "file-token",
      baseUrl: "http://127.0.0.1:8000",
      workspace: "configured-space",
      isRemote: false,
    });
  });
});
