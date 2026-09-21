import { NextRequest, NextResponse } from "next/server";

import { parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";
import { computeMemoryStats } from "@/lib/memory-stats";

const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const MAX_ITEMS = 5_000;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ workspace: string }> },
) {
  try {
    const workspace = parseWorkspaceId((await context.params).workspace);
    const { client } = await getHonchoClient();
    const first = await client.listConclusions(workspace, { page: 1, size: PAGE_SIZE });
    const pageLimit = Math.min(first.pages, MAX_PAGES);
    let items = first.items.slice(0, MAX_ITEMS);
    for (let page = 2; page <= pageLimit && items.length < MAX_ITEMS; page += 1) {
      const next = await client.listConclusions(workspace, { page, size: PAGE_SIZE });
      items = [...items, ...next.items].slice(0, MAX_ITEMS);
    }
    const truncated = first.total > items.length;
    const queue = await client.getQueueStatus(workspace);
    return NextResponse.json({
      workspace,
      stats: computeMemoryStats(items, first.total, truncated),
      queue: {
        total_work_units: queue.total_work_units,
        completed_work_units: queue.completed_work_units,
        in_progress_work_units: queue.in_progress_work_units,
        pending_work_units: queue.pending_work_units,
      },
    });
  } catch (error) {
    const status = error instanceof Error && /Invalid workspace/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to compute memory statistics." }, { status });
  }
}
