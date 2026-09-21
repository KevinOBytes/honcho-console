/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { GET } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

describe("GET /api/[workspace]/sessions/[sessionId]/summaries", () => {
  let client: { listSessionSummaries: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { listSessionSummaries: vi.fn() };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("returns the summaries for a session", async () => {
    const summaries = {
      id: "session-1",
      short_summary: { content: "Short.", message_id: "m1", summary_type: "short", created_at: "2026-09-20T00:00:00Z", token_count: 8 },
      long_summary: null,
    };
    client.listSessionSummaries.mockResolvedValue(summaries);

    const response = await GET(
      new NextRequest("http://localhost/api/oasis/sessions/session-1/summaries"),
      { params: Promise.resolve({ workspace: "oasis", sessionId: "session-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(summaries);
    expect(client.listSessionSummaries).toHaveBeenCalledWith("oasis", "session-1");
  });

  it("maps invalid session identifiers to 400", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/oasis/sessions/..%2Fmessages/summaries"),
      { params: Promise.resolve({ workspace: "oasis", sessionId: "..%2Fmessages" }) },
    );
    expect(response.status).toBe(400);
    expect(client.listSessionSummaries).not.toHaveBeenCalled();
  });

  it("maps upstream failures to 502", async () => {
    client.listSessionSummaries.mockRejectedValue(new Error("Honcho returned HTTP 500."));
    const response = await GET(
      new NextRequest("http://localhost/api/oasis/sessions/session-1/summaries"),
      { params: Promise.resolve({ workspace: "oasis", sessionId: "session-1" }) },
    );
    expect(response.status).toBe(502);
  });
});
