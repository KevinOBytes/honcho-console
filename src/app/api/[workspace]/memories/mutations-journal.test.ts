/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { recordChange } from "@/lib/change-journal";

import { POST } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

vi.mock("@/lib/change-journal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/change-journal")>();
  return { ...actual, recordChange: vi.fn().mockResolvedValue(undefined) };
});

const mockedGetHonchoClient = vi.mocked(getHonchoClient);
const mockedRecordChange = vi.mocked(recordChange);

const routeContext = { params: Promise.resolve({ workspace: "oasis" }) };

const conclusion = {
  id: "conclusion-1",
  content: "Kevin prefers local models.",
  observer_id: "hermes",
  observed_id: "kevo",
  session_id: null,
  level: "explicit",
  created_at: "2026-09-20T00:00:00Z",
};

describe("memory mutation journaling", () => {
  let client: {
    createConclusion: ReturnType<typeof vi.fn>;
    deleteConclusion: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    client = { createConclusion: vi.fn(), deleteConclusion: vi.fn() };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
    mockedRecordChange.mockClear().mockResolvedValue(undefined);
  });

  it("records a journal entry when a conclusion is created", async () => {
    client.createConclusion.mockResolvedValue(conclusion);

    const response = await POST(
      new NextRequest("http://localhost/api/oasis/memories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "Kevin prefers local models.", observer_id: "hermes", observed_id: "kevo" }),
      }),
      routeContext,
    );

    expect(response.status).toBe(201);
    expect(mockedRecordChange).toHaveBeenCalledTimes(1);
    const entry = mockedRecordChange.mock.calls[0]?.[0];
    expect(entry?.action).toBe("create");
    expect(entry?.workspace).toBe("oasis");
    expect(entry?.id).toBe("conclusion-1");
    expect(entry?.after).toBe("Kevin prefers local models.");
  });

  it("does not journal a failed mutation", async () => {
    client.createConclusion.mockRejectedValue(new Error("Honcho returned HTTP 503."));
    await POST(
      new NextRequest("http://localhost/api/oasis/memories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "x", observer_id: "hermes", observed_id: "kevo" }),
      }),
      routeContext,
    ).catch(() => undefined);
    expect(mockedRecordChange).not.toHaveBeenCalled();
  });
});
