/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readChanges, type ChangeJournalEntry } from "@/lib/change-journal";

import { GET } from "./route";

vi.mock("@/lib/change-journal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/change-journal")>();
  return { ...actual, readChanges: vi.fn() };
});

const mockedReadChanges = vi.mocked(readChanges);

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
    expect(mockedReadChanges).toHaveBeenCalledWith(25);
  });

  it("rejects out-of-range limits", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/journal?limit=500"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });
    expect(response.status).toBe(400);
  });
});
