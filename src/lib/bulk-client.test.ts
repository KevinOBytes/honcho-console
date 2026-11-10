import { describe, expect, it, vi } from "vitest";

import { runChunkedBulkDelete } from "./bulk-client";

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe("runChunkedBulkDelete", () => {
  it("posts ids in bounded chunks with explicit confirmation and aggregates results", async () => {
    const bodies: Array<{ ids: string[]; confirm: boolean }> = [];
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { ids: string[]; confirm: boolean };
      bodies.push(body);
      return okResponse({ deleted: body.ids.filter((id) => id !== "id-3"), failed: body.ids.includes("id-3") ? [{ id: "id-3", error: "gone" }] : [] });
    });
    const progress: number[] = [];
    const ids = Array.from({ length: 5 }, (_, index) => `id-${index}`);
    const result = await runChunkedBulkDelete({ url: "/api/oasis/memories/bulk-delete", ids, chunkSize: 2, fetchImpl, onProgress: (done) => progress.push(done) });

    expect(bodies.map((body) => body.ids)).toEqual([["id-0", "id-1"], ["id-2", "id-3"], ["id-4"]]);
    expect(bodies.every((body) => body.confirm === true)).toBe(true);
    expect(result.deleted).toEqual(["id-0", "id-1", "id-2", "id-4"]);
    expect(result.failed).toEqual([{ id: "id-3", error: "gone" }]);
    expect(result.stopped).toBe(false);
    expect(progress).toEqual([2, 4, 5]);
  });

  it("stops between chunks when asked and reports the untouched remainder", async () => {
    let stop = false;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { ids: string[] };
      stop = true;
      return okResponse({ deleted: body.ids, failed: [] });
    });
    const result = await runChunkedBulkDelete({ url: "/x", ids: ["a", "b", "c"], chunkSize: 1, fetchImpl, shouldStop: () => stop });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.deleted).toEqual(["a"]);
    expect(result.remaining).toEqual(["b", "c"]);
    expect(result.stopped).toBe(true);
  });

  it("halts on a whole-request failure and marks that chunk failed", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 502, json: async () => ({ error: "Honcho returned HTTP 503." }) }) as Response);
    const result = await runChunkedBulkDelete({ url: "/x", ids: ["a", "b", "c"], chunkSize: 2, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.failed).toEqual([{ id: "a", error: "Honcho returned HTTP 503." }, { id: "b", error: "Honcho returned HTTP 503." }]);
    expect(result.remaining).toEqual(["c"]);
    expect(result.error).toBe("Honcho returned HTTP 503.");
  });
});
