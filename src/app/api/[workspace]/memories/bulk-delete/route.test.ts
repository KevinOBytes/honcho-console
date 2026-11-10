/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";
import { recordChange } from "@/lib/change-journal";

import { POST } from "./route";

vi.mock("@/lib/server", () => ({ getHonchoClient: vi.fn() }));
vi.mock("@/lib/change-journal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/change-journal")>();
  return { ...actual, recordChange: vi.fn().mockResolvedValue(undefined) };
});

const mockedGetHonchoClient = vi.mocked(getHonchoClient);
const mockedRecordChange = vi.mocked(recordChange);

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/oasis/memories/bulk-delete", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    { params: Promise.resolve({ workspace: "oasis" }) },
  );
}

describe("POST /api/[workspace]/memories/bulk-delete", () => {
  let client: { deleteConclusion: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { deleteConclusion: vi.fn().mockResolvedValue(undefined) };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
    mockedRecordChange.mockClear().mockResolvedValue(undefined);
  });

  it("deletes every requested conclusion and journals each deletion", async () => {
    const response = await post({ ids: ["c1", "c2"], confirm: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: ["c1", "c2"], failed: [] });
    expect(client.deleteConclusion).toHaveBeenCalledWith("oasis", "c1");
    expect(client.deleteConclusion).toHaveBeenCalledWith("oasis", "c2");
    expect(mockedRecordChange).toHaveBeenCalledTimes(2);
    expect(mockedRecordChange.mock.calls[0]?.[0]).toMatchObject({ action: "delete", workspace: "oasis", id: "c1" });
  });

  it("rejects requests without explicit confirmation before calling Honcho", async () => {
    const response = await post({ ids: ["c1"] });
    expect(response.status).toBe(400);
    expect(client.deleteConclusion).not.toHaveBeenCalled();
  });

  it("rejects oversized and malformed id lists before calling Honcho", async () => {
    expect((await post({ ids: Array.from({ length: 101 }, (_, index) => `c${index}`), confirm: true })).status).toBe(400);
    expect((await post({ ids: ["../x"], confirm: true })).status).toBe(400);
    expect(client.deleteConclusion).not.toHaveBeenCalled();
  });

  it("reports partial failures without journaling the failed ids", async () => {
    client.deleteConclusion.mockImplementation(async (_workspace: string, id: string) => {
      if (id === "c2") throw new Error("Honcho returned HTTP 404.");
    });
    const response = await post({ ids: ["c1", "c2"], confirm: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: ["c1"], failed: [{ id: "c2", error: "Honcho returned HTTP 404." }] });
    expect(mockedRecordChange).toHaveBeenCalledTimes(1);
  });

  it("returns 502 when every deletion failed", async () => {
    client.deleteConclusion.mockRejectedValue(new Error("Honcho returned HTTP 503."));
    const response = await post({ ids: ["c1"], confirm: true });
    expect(response.status).toBe(502);
  });
});
