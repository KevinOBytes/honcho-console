/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readChangesFiltered, type ChangeJournalEntry } from "@/lib/change-journal";

import { GET } from "./route";

vi.mock("@/lib/change-journal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/change-journal")>();
  return { ...actual, readChangesFiltered: vi.fn() };
});

const mockedReadChanges = vi.mocked(readChangesFiltered);

const entries: ChangeJournalEntry[] = [
  {
    at: "2026-09-20T12:00:00.000Z",
    action: "replace",
    workspace: "oasis",
    summary: "Replaced conclusion c1",
    id: "c1",
    before: "old",
    after: "new",
  },
];

describe("GET /api/[workspace]/journal", () => {
  beforeEach(() => {
    mockedReadChanges.mockReset();
  });

  it("returns the recorded changes with a bounded limit", async () => {
    mockedReadChanges.mockResolvedValue(entries);

    const response = await GET(new NextRequest("http://localhost/api/oasis/journal?limit=25"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ workspace: "oasis", items: entries });
    expect(mockedReadChanges).toHaveBeenCalledWith({ limit: 25, action: undefined, workspace: undefined });
  });

  it("forwards action and workspace filters", async () => {
    mockedReadChanges.mockResolvedValue(entries);

    const response = await GET(new NextRequest("http://localhost/api/oasis/journal?limit=10&action=replace&workspace=oasis"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });

    expect(response.status).toBe(200);
    expect(mockedReadChanges).toHaveBeenCalledWith({ limit: 10, action: "replace", workspace: "oasis" });
  });

  it("rejects an invalid action filter", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/journal?action=explode"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects an invalid workspace filter", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/journal?workspace=../etc"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects out-of-range limits", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/journal?limit=500"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });
    expect(response.status).toBe(400);
  });
});
