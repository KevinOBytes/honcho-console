import { NextRequest, NextResponse } from "next/server";

import { recordChange } from "@/lib/change-journal";
import { parseResourceId, parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ workspace: string; sessionId: string }> },
) {
  try {
    const params = await context.params;
    const workspace = parseWorkspaceId(params.workspace);
    const sessionId = parseResourceId(params.sessionId, "session");
    const { client } = await getHonchoClient();
    await client.deleteSession(workspace, sessionId);
    try {
      await recordChange({ action: "session-delete", workspace, summary: `Deleted session ${sessionId} and its messages`, id: sessionId });
    } catch {
      // Journaling is best-effort.
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const status = error instanceof Error && /Invalid (session|workspace)/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete session." }, { status });
  }
}
