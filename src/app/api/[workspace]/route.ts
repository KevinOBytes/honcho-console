import { NextRequest, NextResponse } from "next/server";

import { parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ workspace: string }> },
) {
  try {
    const workspace = parseWorkspaceId((await context.params).workspace);
    const { client } = await getHonchoClient();
    const [peers, sessions, conclusions, queue] = await Promise.all([
      client.listPeers(workspace, 1, 100),
      client.listSessions(workspace, 1, 50),
      client.listConclusions(workspace, { page: 1, size: 20 }),
      client.getQueueStatus(workspace),
    ]);
    return NextResponse.json({
      workspace,
      peers: { total: peers.total, items: peers.items, page: peers.page, size: peers.size, pages: peers.pages },
      sessions: { total: sessions.total, items: sessions.items, page: sessions.page, size: sessions.size, pages: sessions.pages },
      conclusions: { total: conclusions.total, items: conclusions.items, page: conclusions.page, size: conclusions.size, pages: conclusions.pages },
      queue: {
        total_work_units: queue.total_work_units,
        completed_work_units: queue.completed_work_units,
        in_progress_work_units: queue.in_progress_work_units,
        pending_work_units: queue.pending_work_units,
      },
    });
  } catch (error) {
    const status = error instanceof Error && /Invalid workspace/.test(error.message) ? 400 : 502;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load workspace." },
      { status },
    );
  }
}
