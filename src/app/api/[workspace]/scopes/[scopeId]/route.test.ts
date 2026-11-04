/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { GET } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

const sessionsPage = {
  items: [
    { id: "s1", is_active: true, workspace_id: "oasis", metadata: {}, configuration: {}, created_at: "2026-09-04T12:00:00Z" },
  ],
  total: 1,
  page: 1,
  size: 100,
  pages: 1,
};

describe("GET /api/[workspace]/scopes/[scopeId]", () => {
  let client: { listAllScopes: ReturnType<typeof vi.fn>; listScopeSessions: ReturnType<typeof vi.fn>; getScopeStatus: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = {
      listAllScopes: vi.fn().mockResolvedValue({
        items: [{ id: "support", metadata: {}, created_at: "2026-09-05T12:00:00Z", session_count: 1 }],
        total: 1,
        truncated: false,
      }),
      listScopeSessions: vi.fn().mockResolvedValue(sessionsPage),
      getScopeStatus: vi.fn().mockResolvedValue({ backfill_status: { s1: { state: "completed", updated_at: "2026-09-05T12:00:00Z", docs_copied: 12 } } }),
    };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("returns scope details with sessions and status", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/scopes/support"), {
      params: Promise.resolve({ workspace: "oasis", scopeId: "support" }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.scope?.id).toBe("support");
    expect(payload.sessions).toEqual([{ id: "s1", is_active: true, created_at: "2026-09-04T12:00:00Z" }]);
    expect(payload.status.backfill_status.s1.state).toBe("completed");
    expect(client.listScopeSessions).toHaveBeenCalledWith("oasis", "support", 1, 100);
  });

  it("reports an unknown scope as null without failing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/scopes/nope"), {
      params: Promise.resolve({ workspace: "oasis", scopeId: "nope" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ scope: null });
  });

  it("rejects an invalid scope identifier", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/scopes/..%2Fetc"), {
      params: Promise.resolve({ workspace: "oasis", scopeId: "../etc" }),
    });
    expect(response.status).toBe(400);
  });
});