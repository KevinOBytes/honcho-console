/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";
import type { MemoryStats } from "@/lib/memory-stats";

import { GET } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

const conclusion = (level: string, observer: string, createdAt: string) => ({
  id: `c-${observer}-${level}-${createdAt}`,
  content: "fact",
  observer_id: observer,
  observed_id: "kevo",
  session_id: null,
  level,
  created_at: createdAt,
});

describe("GET /api/[workspace]/stats", () => {
  let client: { listConclusions: ReturnType<typeof vi.fn>; getQueueStatus: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = {
      listConclusions: vi.fn(),
      getQueueStatus: vi.fn().mockResolvedValue({ total_work_units: 9, completed_work_units: 6, in_progress_work_units: 2, pending_work_units: 1 }),
    };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("aggregates level counts, top peers, and daily buckets across pages", async () => {
    client.listConclusions.mockImplementation(async (_workspace: string, options: { page?: number }) => {
      if ((options.page ?? 1) === 1) {
        return {
          items: [
            conclusion("explicit", "hermes", "2026-09-19T10:00:00Z"),
            conclusion("deductive", "hermes", "2026-09-19T11:00:00Z"),
          ],
          total: 3,
          page: 1,
          size: 100,
          pages: 2,
        };
      }
      return {
        items: [conclusion("inductive", "kevo", "2026-09-20T12:00:00Z")],
        total: 3,
        page: 2,
        size: 100,
        pages: 2,
      };
    });

    const response = await GET(new NextRequest("http://localhost/api/oasis/stats"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { stats: MemoryStats; queue: Record<string, number> };
    expect(payload.stats.totalAvailable).toBe(3);
    expect(payload.stats.analyzed).toBe(3);
    expect(payload.stats.truncated).toBe(false);
    expect(payload.stats.byLevel).toEqual([
      { level: "explicit", count: 1 },
      { level: "deductive", count: 1 },
      { level: "inductive", count: 1 },
      { level: "contradiction", count: 0 },
    ]);
    expect(payload.stats.topObservers[0]).toEqual({ id: "hermes", count: 2 });
    expect(payload.stats.daily.at(-1)).toEqual({ date: "2026-09-20", count: 1 });
    expect(payload.queue.pending_work_units).toBe(1);
    expect(client.listConclusions).toHaveBeenCalledTimes(2);
  });

  it("flags truncation when totals exceed the analysis cap", async () => {
    client.listConclusions.mockImplementation(async (_workspace: string, options: { page?: number }) => ({
      items: Array.from({ length: 100 }, (_, index) => conclusion("explicit", "hermes", `2026-09-${String((index % 19) + 1).padStart(2, "0")}T10:00:00Z`)),
      total: 5000,
      page: options.page ?? 1,
      size: 100,
      pages: 2,
    }));

    const response = await GET(new NextRequest("http://localhost/api/oasis/stats"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });

    const payload = (await response.json()) as { stats: MemoryStats };
    expect(payload.stats.truncated).toBe(true);
    expect(payload.stats.analyzed).toBe(200);
  });

  it("maps upstream failures to 502", async () => {
    client.listConclusions.mockRejectedValue(new Error("Honcho returned HTTP 503."));
    const response = await GET(new NextRequest("http://localhost/api/oasis/stats"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });
    expect(response.status).toBe(502);
  });
});
