/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { GET } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

const contextPayload = {
  id: "session-1",
  messages: [{ id: "m1", content: "hello", peer_id: "kevo", session_id: "session-1", metadata: {}, created_at: "2026-09-04T12:00:00Z", workspace_id: "oasis", token_count: 3 }],
  summary: { content: "A short summary", message_id: "m1", summary_type: "short", created_at: "2026-09-04T12:00:00Z", token_count: 5 },
  peer_representation: "Kevin prefers direct prose.",
  peer_card: ["IDENTITY: Name: Kevin"],
};

describe("GET /api/[workspace]/sessions/[sessionId]/context", () => {
  let client: { getSessionContext: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { getSessionContext: vi.fn().mockResolvedValue(contextPayload) };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("returns the session context payload", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/sessions/session-1/context"), {
      params: Promise.resolve({ workspace: "oasis", sessionId: "session-1" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ session_context: contextPayload });
    expect(client.getSessionContext).toHaveBeenCalledWith("oasis", "session-1");
  });

  it("rejects an invalid session identifier", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/sessions/../etc/context"), {
      params: Promise.resolve({ workspace: "oasis", sessionId: "../etc" }),
    });
    expect(response.status).toBe(400);
    expect(client.getSessionContext).not.toHaveBeenCalled();
  });

  it("surfaces upstream failures as a 502 with an error", async () => {
    client.getSessionContext.mockRejectedValue(new Error("Honcho returned HTTP 500."));
    const response = await GET(new NextRequest("http://localhost/api/oasis/sessions/session-1/context"), {
      params: Promise.resolve({ workspace: "oasis", sessionId: "session-1" }),
    });
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toHaveProperty("error");
  });
});