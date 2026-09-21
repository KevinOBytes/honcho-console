/** @vitest-environment node */

import { describe, expect, it } from "vitest";

import { computeMemoryStats, type StatsInputConclusion } from "./memory-stats";

function conclusion(overrides: Partial<StatsInputConclusion> = {}): StatsInputConclusion {
  return {
    level: "explicit",
    observer_id: "hermes",
    observed_id: "kevo",
    session_id: null,
    created_at: "2026-09-10T12:00:00Z",
    ...overrides,
  };
}

describe("computeMemoryStats", () => {
  it("counts levels, top relationships, and sessions", () => {
    const stats = computeMemoryStats(
      [
        conclusion(),
        conclusion({ level: "deductive", session_id: "s1" }),
        conclusion({ level: "deductive", observer_id: "kevo", observed_id: "hermes", session_id: "s1" }),
        conclusion({ level: "contradiction", observer_id: "kevo" }),
      ],
      4,
      false,
    );

    expect(stats.analyzed).toBe(4);
    expect(stats.totalAvailable).toBe(4);
    expect(stats.truncated).toBe(false);
    expect(stats.byLevel).toEqual([
      { level: "explicit", count: 1 },
      { level: "deductive", count: 2 },
      { level: "inductive", count: 0 },
      { level: "contradiction", count: 1 },
    ]);
    expect(stats.topObservers).toEqual([
      { id: "hermes", count: 2 },
      { id: "kevo", count: 2 },
    ]);
    expect(stats.topSessions[0]).toEqual({ id: "s1", count: 2 });
  });

  it("buckets conclusions into the last 30 days with zero-filled gaps", () => {
    const stats = computeMemoryStats(
      [
        conclusion({ created_at: "2026-09-20T03:00:00Z" }),
        conclusion({ created_at: "2026-09-20T09:00:00Z" }),
        conclusion({ created_at: "2026-08-01T09:00:00Z" }),
      ],
      3,
      false,
    );

    const dates = stats.daily.map((bucket) => bucket.date);
    expect(dates).toHaveLength(30);
    expect(dates[dates.length - 1]).toBe("2026-09-20");
    expect(dates[0]).toBe("2026-08-22");
    const total = stats.daily.reduce((sum, bucket) => sum + bucket.count, 0);
    expect(total).toBe(2);
    expect(stats.oldest).toBe("2026-08-01T09:00:00Z");
    expect(stats.newest).toBe("2026-09-20T09:00:00Z");
  });

  it("reports truncation and empty data without throwing", () => {
    const stats = computeMemoryStats([], 900, true);
    expect(stats.analyzed).toBe(0);
    expect(stats.totalAvailable).toBe(900);
    expect(stats.truncated).toBe(true);
    expect(stats.topObservers).toEqual([]);
    expect(stats.topSessions).toEqual([]);
    expect(stats.oldest).toBeNull();
    expect(stats.newest).toBeNull();
    expect(stats.daily).toHaveLength(30);
    expect(stats.daily.every((bucket) => bucket.count === 0)).toBe(true);
  });
});
