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
    return NextResponse.json(await client.getQueueStatus(workspace));
  } catch (error) {
    const status = error instanceof Error && /Invalid workspace/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load queue status." }, { status });
  }
}
