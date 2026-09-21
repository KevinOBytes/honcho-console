/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { POST } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

vi.mock("@/lib/change-journal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/change-journal")>();
  return { ...actual, recordChange: vi.fn().mockResolvedValue(undefined) };
});

import { recordChange } from "@/lib/change-journal";

const mockedGetHonchoClient = vi.mocked(getHonchoClient);
const mockedRecordChange = vi.mocked(recordChange);

const routeContext = { params: Promise.resolve({ workspace: "oasis" }) };

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/oasis/dreams", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const queue = {
  total_work_units: 5,
  completed_work_units: 3,
  in_progress_work_units: 1,
  pending_work_units: 1,
};

describe("POST /api/[workspace]/dreams", () => {
  let client: { scheduleDream: ReturnType<typeof vi.fn>; getQueueStatus: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { scheduleDream: vi.fn().mockResolvedValue(undefined), getQueueStatus: vi.fn().mockResolvedValue(queue) };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
    mockedRecordChange.mockClear().mockResolvedValue(undefined);
  });

  it("rejects an unsupported dream type before contacting Honcho", async () => {
    const response = await POST(makeRequest({ observer: "hermes", dream_type: "lucid" }), routeContext);
    expect(response.status).toBe(400);
    expect(client.scheduleDream).not.toHaveBeenCalled();
  });

  it("schedules the dream, returns fresh queue state, and records a journal entry", async () => {
    const response = await POST(
      makeRequest({ observer: "hermes", observed: "kevo", dream_type: "card_refresh", rebuild: true }),
      routeContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, queue });
    expect(client.scheduleDream).toHaveBeenCalledWith("oasis", {
      observer: "hermes",
      observed: "kevo",
      dreamType: "card_refresh",
      sessionId: undefined,
      rebuild: true,
    });
    expect(client.getQueueStatus).toHaveBeenCalledWith("oasis");
    expect(mockedRecordChange).toHaveBeenCalledTimes(1);
    const entry = mockedRecordChange.mock.calls[0]?.[0];
    expect(entry?.action).toBe("dream");
    expect(entry?.workspace).toBe("oasis");
    expect(entry?.summary).toContain("card_refresh");
  });

  it("still succeeds when journaling fails", async () => {
    mockedRecordChange.mockRejectedValueOnce(new Error("disk error"));
    const response = await POST(makeRequest({ observer: "hermes", dream_type: "omni" }), routeContext);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, queue });
  });

  it("maps upstream failures to 502", async () => {
    client.scheduleDream.mockRejectedValue(new Error("Honcho returned HTTP 404."));
    const response = await POST(makeRequest({ observer: "ghost", dream_type: "omni" }), routeContext);
    expect(response.status).toBe(502);
  });
});
