/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { POST } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

const routeContext = { params: Promise.resolve({ workspace: "oasis" }) };

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/oasis/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const message = {
  id: "message-1",
  content: "found it",
  peer_id: "kevo",
  session_id: "session-2",
  metadata: {},
  created_at: "2026-09-20T00:00:00Z",
  workspace_id: "oasis",
  token_count: 3,
};

describe("POST /api/[workspace]/search", () => {
  let client: { searchMessages: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { searchMessages: vi.fn() };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("searches workspace messages and labels the results", async () => {
    client.searchMessages.mockResolvedValue([message]);

    const response = await POST(makeRequest({ query: "found", limit: 30 }), routeContext);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [message], mode: "message-search" });
    expect(client.searchMessages).toHaveBeenCalledWith("oasis", "found", 30);
  });

  it("defaults the limit and trims the query", async () => {
    client.searchMessages.mockResolvedValue([]);
    await POST(makeRequest({ query: "  found  " }), routeContext);
    expect(client.searchMessages).toHaveBeenCalledWith("oasis", "found", 20);
  });

  it("rejects an empty query and out-of-range limits", async () => {
    expect((await POST(makeRequest({ query: "" }), routeContext)).status).toBe(400);
    expect((await POST(makeRequest({ query: "ok", limit: 1000 }), routeContext)).status).toBe(400);
    expect(client.searchMessages).not.toHaveBeenCalled();
  });
});
