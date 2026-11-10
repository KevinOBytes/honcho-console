/** @vitest-environment node */

import { describe, expect, it, vi } from "vitest";

import { bulkDeleteSchema, collectIds, MAX_BULK_DELETE_IDS, runBulkDelete } from "./bulk-delete";

describe("runBulkDelete", () => {
  it("deletes each unique id once and reports results in input order", async () => {
    const remove = vi.fn(async () => undefined);
    const result = await runBulkDelete(["a", "b", "a", "c"], remove);
    expect(remove).toHaveBeenCalledTimes(3);
    expect(result.deleted).toEqual(["a", "b", "c"]);
    expect(result.failed).toEqual([]);
  });

  it("continues past individual failures and reports each failure", async () => {
    const remove = vi.fn(async (id: string) => {
      if (id === "b") throw new Error("Honcho returned HTTP 404.");
    });
    const result = await runBulkDelete(["a", "b", "c"], remove);
    expect(result.deleted).toEqual(["a", "c"]);
    expect(result.failed).toEqual([{ id: "b", error: "Honcho returned HTTP 404." }]);
  });

  it("never runs more than the concurrency limit at once", async () => {
    let active = 0;
    let peak = 0;
    const remove = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
    };
    await runBulkDelete(Array.from({ length: 20 }, (_, index) => `id-${index}`), remove, 3);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe("bulkDeleteSchema", () => {
  it("requires explicit confirmation and bounded, valid ids", () => {
    expect(bulkDeleteSchema.safeParse({ ids: ["a"], confirm: true }).success).toBe(true);
    expect(bulkDeleteSchema.safeParse({ ids: ["a"] }).success).toBe(false);
    expect(bulkDeleteSchema.safeParse({ ids: ["a"], confirm: "yes" }).success).toBe(false);
    expect(bulkDeleteSchema.safeParse({ ids: [], confirm: true }).success).toBe(false);
    expect(bulkDeleteSchema.safeParse({ ids: ["../etc"], confirm: true }).success).toBe(false);
    const tooMany = Array.from({ length: MAX_BULK_DELETE_IDS + 1 }, (_, index) => `id-${index}`);
    expect(bulkDeleteSchema.safeParse({ ids: tooMany, confirm: true }).success).toBe(false);
  });
});

describe("collectIds", () => {
  it("walks every page until the last one and dedupes", async () => {
    const pages: Record<number, { items: Array<{ id: string }>; total: number; pages: number }> = {
      1: { items: [{ id: "a" }, { id: "b" }], total: 4, pages: 2 },
      2: { items: [{ id: "b" }, { id: "c" }], total: 4, pages: 2 },
    };
    const fetchPage = vi.fn(async (page: number) => pages[page]!);
    const result = await collectIds(fetchPage, 100);
    expect(result).toEqual({ ids: ["a", "b", "c"], total: 4, truncated: false });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("stops at the cap and reports truncation", async () => {
    const fetchPage = vi.fn(async (page: number) => ({ items: [{ id: `x${page}a` }, { id: `x${page}b` }], total: 10, pages: 5 }));
    const result = await collectIds(fetchPage, 3);
    expect(result.ids).toHaveLength(3);
    expect(result.truncated).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("stops on an empty page instead of looping", async () => {
    const fetchPage = vi.fn(async (page: number) => (page === 1 ? { items: [{ id: "a" }], total: 5, pages: 5 } : { items: [], total: 5, pages: 5 }));
    const result = await collectIds(fetchPage, 100);
    expect(result.ids).toEqual(["a"]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
