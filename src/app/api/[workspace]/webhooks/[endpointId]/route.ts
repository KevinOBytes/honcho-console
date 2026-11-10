import { NextRequest, NextResponse } from "next/server";

import { recordChange } from "@/lib/change-journal";
import { parseResourceId, parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ workspace: string; endpointId: string }> },
) {
  try {
    const params = await context.params;
    const workspace = parseWorkspaceId(params.workspace);
    const endpointId = parseResourceId(params.endpointId, "webhook");
    const { client } = await getHonchoClient();
    await client.deleteWebhook(workspace, endpointId);
    try {
      await recordChange({ action: "webhook-delete", workspace, summary: `Deleted webhook endpoint ${endpointId}`, id: endpointId });
    } catch {
      // Journaling is best-effort.
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const status = error instanceof Error && /Invalid (webhook|workspace)/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete webhook." }, { status });
  }
}
