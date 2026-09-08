/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { GET } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

type FakeClient = {
  listAllWorkspaces: ReturnType<typeof vi.fn>;
  listPeers: ReturnType<typeof vi.fn>;
};

describe("GET /api/status", () => {
  let client: FakeClient;

  beforeEach(() => {
    client = {
      listAllWorkspaces: vi.fn(),
      listPeers: vi.fn(),
    };
    mockedGetHonchoClient.mockResolvedValue({
      client,
      configuredWorkspace: "oasis",
      baseUrl: "http://127.0.0.1:8000",
      isRemote: false,
    } as never);
  });

  it("validates a configured workspace when discovery is forbidden", async () => {
    client.listAllWorkspaces.mockRejectedValue(new Error("Honcho returned HTTP 403."));
    client.listPeers.mockResolvedValue({ items: [], total: 0, page: 1, size: 1, pages: 0 });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      configuredWorkspace: "oasis",
      selectedWorkspace: "oasis",
      workspaceListing: "configured",
      workspaces: [{ id: "oasis", created_at: null }],
    });
    expect(client.listPeers).toHaveBeenCalledWith("oasis", 1, 1);
  });

  it("returns an actionable status when discovery is forbidden without a configured workspace", async () => {
    mockedGetHonchoClient.mockResolvedValue({
      client,
      configuredWorkspace: null,
      baseUrl: "http://127.0.0.1:8000",
      isRemote: false,
    } as never);
    client.listAllWorkspaces.mockRejectedValue(new Error("Honcho returned HTTP 401."));

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      configuredWorkspace: null,
      selectedWorkspace: null,
      workspaceListing: "unauthorized",
      error: expect.stringContaining("workspace"),
    });
    expect(client.listPeers).not.toHaveBeenCalled();
  });

  it("reports a configured workspace as unavailable when its validation request is rejected", async () => {
    client.listAllWorkspaces.mockRejectedValue(new Error("Honcho returned HTTP 403."));
    client.listPeers.mockRejectedValue(new Error("The configured workspace is unavailable."));

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      workspaceListing: "unavailable",
      selectedWorkspace: "oasis",
      error: expect.stringContaining("unavailable"),
    });
  });
});
