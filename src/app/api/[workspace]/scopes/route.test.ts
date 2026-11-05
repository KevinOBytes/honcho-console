/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { GET } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

const page = {
  items: [
    { id: "support", metadata: { purpose: "tier-1 support" }, created_at: "2026-09-05T12:00:00Z", session_count: 3 },
    { id: "lab", metadata: {}, created_at: "2026-09-06T12:00:00Z", session_count: null },
  ],
  total: 2,
  page: 1,
  size: 100,
  pages: 1,
};

describe("GET /api/[workspace]/scopes", () => {
  let client: { listAllScopes: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { listAllScopes: vi.fn().mockResolvedValue({ items: page.items, total: 2, truncated: false }) };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("returns the scopes for the workspace", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/scopes"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      workspace: "oasis",
      scopes: [
        { id: "support", created_at: "2026-09-05T12:00:00Z", session_count: 3, metadata: { purpose: "tier-1 support" } },
        { id: "lab", created_at: "2026-09-06T12:00:00Z", session_count: null, metadata: {} },
      ],
      total: 2,
      truncated: false,
    });
  });

  it("surfaces upstream failures as a 502", async () => {
    client.listAllScopes.mockRejectedValue(new Error("Honcho returned HTTP 500."));
    const response = await GET(new NextRequest("http://localhost/api/oasis/scopes"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });
    expect(response.status).toBe(502);
  });
});