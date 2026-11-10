// Client-side helper: no server-only imports. Splits a large selection into bounded,
// explicitly confirmed bulk-delete requests so progress is visible and the run can stop.

export const CLIENT_BULK_CHUNK = 100;

export type ChunkedDeleteResult = {
  deleted: string[];
  failed: Array<{ id: string; error: string }>;
  remaining: string[];
  stopped: boolean;
  error?: string;
};

export async function runChunkedBulkDelete({
  url,
  ids,
  chunkSize = CLIENT_BULK_CHUNK,
  onProgress,
  shouldStop,
  fetchImpl = fetch,
}: {
  url: string;
  ids: string[];
  chunkSize?: number;
  onProgress?: (processed: number, total: number) => void;
  shouldStop?: () => boolean;
  fetchImpl?: typeof fetch;
}): Promise<ChunkedDeleteResult> {
  const unique = [...new Set(ids)];
  const result: ChunkedDeleteResult = { deleted: [], failed: [], remaining: [], stopped: false };
  for (let offset = 0; offset < unique.length; offset += chunkSize) {
    if (offset > 0 && shouldStop?.()) {
      result.stopped = true;
      result.remaining = unique.slice(offset);
      return result;
    }
    const chunk = unique.slice(offset, offset + chunkSize);
    let payload: { deleted?: string[]; failed?: Array<{ id: string; error: string }>; error?: string } = {};
    let ok = false;
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: chunk, confirm: true }),
      });
      payload = await response.json().catch(() => ({}));
      ok = response.ok;
      if (!ok && !payload.error) payload.error = `Request failed with HTTP ${response.status}.`;
    } catch (error) {
      payload = { error: error instanceof Error ? error.message : "Network error." };
    }
    if (!ok) {
      const message = payload.error ?? "Bulk delete failed.";
      result.failed.push(...chunk.map((id) => ({ id, error: message })));
      result.remaining = unique.slice(offset + chunk.length);
      result.error = message;
      return result;
    }
    result.deleted.push(...(payload.deleted ?? []));
    result.failed.push(...(payload.failed ?? []));
    onProgress?.(Math.min(offset + chunk.length, unique.length), unique.length);
  }
  return result;
}
