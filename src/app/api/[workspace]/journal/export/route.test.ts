/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readChangesFiltered, type ChangeJournalEntry } from "@/lib/change-journal";

import { GET } from "./route";

vi.mock("@/lib/change-journal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/change-journal")>();
  return { ...actual, readChangesFiltered: vi.fn() };
});

const mockedReadChangesFiltered = vi.mocked(readChangesFiltered);

const entries: ChangeJournalEntry[] = [
  {
    at: "2026-09-20T12:00:00.000Z",
    action: "delete",
    workspace: "oasis",
    summary: "Deleted conclusion c9",
    id: "c9",
  },
];

describe("GET /api/[workspace]/journal/export", () => {
  beforeEach(() => {
    mockedReadChangesFiltered.mockReset();
  });

  it("returns a JSONL download attachment", async () => {
    mockedReadChangesFiltered.mockResolvedValue(entries);

    const response = await GET(new NextRequest("http://localhost/api/oasis/journal/export?action=delete&workspace=oasis"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("content-disposition")).toContain('filename="honcho-console-journal-oasis.jsonl"');
    await expect(response.text()).resolves.toContain('"action":"delete"');
    expect(mockedReadChangesFiltered).toHaveBeenCalledWith({ limit: 5000, action: "delete", workspace: "oasis" });
  });

  it("rejects an invalid action", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/journal/export?action=explode"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects an out-of-range limit", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/journal/export?limit=99999"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });
    expect(response.status).toBe(400);
  });
});