import { NextRequest, NextResponse } from "next/server";

import { parseResourceId, parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ workspace: string; sessionId: string }> },
) {
  try {
    const params = await context.params;
    const workspace = parseWorkspaceId(params.workspace);
    const sessionId = parseResourceId(params.sessionId, "session");
    const { client } = await getHonchoClient();
    return NextResponse.json(await client.listSessionSummaries(workspace, sessionId));
  } catch (error) {
    const status = error instanceof Error && /Invalid (workspace|session)/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load session summaries." }, { status });
  }
}
