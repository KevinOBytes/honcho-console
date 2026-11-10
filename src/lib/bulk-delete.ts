import { z } from "zod";

/** Maximum ids accepted by one bulk-delete request. Clients chunk larger selections. */
export const MAX_BULK_DELETE_IDS = 100;
/** Parallel upstream deletes per bulk request; keeps a local Honcho responsive. */
export const BULK_DELETE_CONCURRENCY = 4;
/** Hard cap for "select all matching" id collection. */
export const MAX_SELECTABLE_IDS = 20_000;
export const MAX_TEXT_FILTER_LENGTH = 500;

const resourceId = z.string().trim().min(1).max(512).regex(/^[a-zA-Z0-9_-]{1,512}$/, "Invalid identifier.");

export const bulkDeleteSchema = z.object({
  ids: z.array(resourceId).min(1).max(MAX_BULK_DELETE_IDS),
  confirm: z.literal(true),
});

export type BulkDeleteResult = {
  deleted: string[];
  failed: Array<{ id: string; error: string }>;
};

/**
 * Delete each unique id with bounded concurrency. A failure on one id never aborts the others;
 * results are reported in input order so the caller can journal and display them deterministically.
 */
export async function runBulkDelete(
  ids: string[],
  remove: (id: string) => Promise<void>,
  concurrency = BULK_DELETE_CONCURRENCY,
): Promise<BulkDeleteResult> {
  const unique = [...new Set(ids)];
  const outcome = new Map<string, string | null>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < unique.length) {
      const id = unique[cursor++]!;
      try {
        await remove(id);
        outcome.set(id, null);
      } catch (error) {
        outcome.set(id, error instanceof Error ? error.message : "Delete failed.");
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, unique.length)) }, worker));
  const result: BulkDeleteResult = { deleted: [], failed: [] };
  for (const id of unique) {
    const error = outcome.get(id);
    if (error === null) result.deleted.push(id);
    else result.failed.push({ id, error: error ?? "Delete did not run." });
  }
  return result;
}

/** Walk paginated listings and collect unique ids up to a hard cap. */
export async function collectIds(
  fetchPage: (page: number) => Promise<{ items: Array<{ id: string }>; total: number; pages: number }>,
  cap = MAX_SELECTABLE_IDS,
): Promise<{ ids: string[]; total: number; truncated: boolean }> {
  const seen = new Set<string>();
  let total = 0;
  let pages = 1;
  for (let page = 1; page <= pages; page += 1) {
    const result = await fetchPage(page);
    total = result.total;
    pages = result.pages;
    if (result.items.length === 0) break;
    for (const item of result.items) {
      if (seen.size >= cap) break;
      seen.add(item.id);
    }
    if (seen.size >= cap) break;
  }
  const ids = [...seen];
  return { ids, total, truncated: ids.length < total && ids.length >= cap };
}

export function parseTextFilter(value: string | null): string | undefined {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_TEXT_FILTER_LENGTH) {
    throw new Error(`Invalid text filter: must be at most ${MAX_TEXT_FILTER_LENGTH} characters.`);
  }
  return trimmed;
}
