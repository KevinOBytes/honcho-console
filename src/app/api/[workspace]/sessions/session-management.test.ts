/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";
import { recordChange } from "@/lib/change-journal";

import { GET } from "./route";
import { DELETE } from "./[sessionId]/route";
import { POST as BULK } from "./bulk-delete/route";
import { GET as IDS } from "./ids/route";

vi.mock("@/lib/server", () => ({ getHonchoClient: vi.fn() }));
vi.mock("@/lib/change-journal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/change-journal")>();
  return { ...actual, recordChange: vi.fn().mockResolvedValue(undefined) };
});

const mockedGetHonchoClient = vi.mocked(getHonchoClient);
const mockedRecordChange = vi.mocked(recordChange);
const params = Promise.resolve({ workspace: "oasis" });

describe("session management routes", () => {
  let client: { listSessions: ReturnType<typeof vi.fn>; deleteSession: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = {
      listSessions: vi.fn(async (_workspace: string, page: number) => ({ items: page === 1 ? [{ id: "s1" }] : [{ id: "s2" }], total: 2, page, size: 100, pages: 2 })),
      deleteSession: vi.fn().mockResolvedValue(undefined),
    };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
    mockedRecordChange.mockClear().mockResolvedValue(undefined);
  });

  it("passes a bounded id search through to the session listing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/sessions?page=1&size=50&contains=2026"), { params });
    expect(response.status).toBe(200);
    expect(client.listSessions).toHaveBeenCalledWith("oasis", 1, 50, { id_contains: "2026" });
    expect((await GET(new NextRequest(`http://localhost/api/oasis/sessions?contains=${"x".repeat(501)}`), { params })).status).toBe(400);
  });

  it("keeps the unfiltered listing call shape when no search is set", async () => {
    await GET(new NextRequest("http://localhost/api/oasis/sessions?page=2&size=50"), { params });
    expect(client.listSessions).toHaveBeenCalledWith("oasis", 2, 50, undefined);
  });

  it("deletes a single session and journals it", async () => {
    const response = await DELETE(new NextRequest("http://localhost/api/oasis/sessions/s1", { method: "DELETE" }), { params: Promise.resolve({ workspace: "oasis", sessionId: "s1" }) });
    expect(response.status).toBe(204);
    expect(client.deleteSession).toHaveBeenCalledWith("oasis", "s1");
    expect(mockedRecordChange.mock.calls[0]?.[0]).toMatchObject({ action: "session-delete", id: "s1" });
  });

  it("rejects an invalid session id before calling Honcho", async () => {
    const response = await DELETE(new NextRequest("http://localhost/api/oasis/sessions/x", { method: "DELETE" }), { params: Promise.resolve({ workspace: "oasis", sessionId: "../x" }) });
    expect(response.status).toBe(400);
    expect(client.deleteSession).not.toHaveBeenCalled();
  });

  it("bulk deletes confirmed session ids and reports partial failure", async () => {
    client.deleteSession.mockImplementation(async (_workspace: string, id: string) => {
      if (id === "s2") throw new Error("Honcho returned HTTP 404.");
    });
    const response = await BULK(new NextRequest("http://localhost/api/oasis/sessions/bulk-delete", { method: "POST", body: JSON.stringify({ ids: ["s1", "s2"], confirm: true }) }), { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: ["s1"], failed: [{ id: "s2", error: "Honcho returned HTTP 404." }] });
    expect(mockedRecordChange).toHaveBeenCalledTimes(1);
  });

  it("refuses an unconfirmed bulk session delete", async () => {
    const response = await BULK(new NextRequest("http://localhost/api/oasis/sessions/bulk-delete", { method: "POST", body: JSON.stringify({ ids: ["s1"] }) }), { params });
    expect(response.status).toBe(400);
    expect(client.deleteSession).not.toHaveBeenCalled();
  });

  it("collects every matching session id", async () => {
    const response = await IDS(new NextRequest("http://localhost/api/oasis/sessions/ids?contains=s"), { params });
    expect(await response.json()).toEqual({ ids: ["s1", "s2"], total: 2, truncated: false });
    expect(client.listSessions).toHaveBeenCalledWith("oasis", 1, 100, { id_contains: "s" });
  });
});
