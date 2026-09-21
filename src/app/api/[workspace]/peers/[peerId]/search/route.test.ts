/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { POST } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

const routeContext = { params: Promise.resolve({ workspace: "oasis", peerId: "kevo" }) };

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/oasis/peers/kevo/search", {
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

describe("POST /api/[workspace]/peers/[peerId]/search", () => {
  let client: { searchPeerMessages: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { searchPeerMessages: vi.fn() };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("searches a peer's messages with a bounded limit", async () => {
    client.searchPeerMessages.mockResolvedValue([message]);

    const response = await POST(makeRequest({ query: "found", limit: 25 }), routeContext);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [message] });
    expect(client.searchPeerMessages).toHaveBeenCalledWith("oasis", "kevo", "found", 25);
  });

  it("rejects an empty query and out-of-range limits", async () => {
    expect((await POST(makeRequest({ query: "  " }), routeContext)).status).toBe(400);
    expect((await POST(makeRequest({ query: "ok", limit: 0 }), routeContext)).status).toBe(400);
    expect((await POST(makeRequest({ query: "ok", limit: 101 }), routeContext)).status).toBe(400);
    expect(client.searchPeerMessages).not.toHaveBeenCalled();
  });
});
