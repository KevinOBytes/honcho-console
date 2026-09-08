import { NextRequest, NextResponse } from "next/server";

import { parseResourceId, parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspace: string; peerId: string }> },
) {
  try {
    const params = await context.params;
    const workspace = parseWorkspaceId(params.workspace);
    const peerId = parseResourceId(params.peerId, "peer");
    const rawTarget = request.nextUrl.searchParams.get("target");
    const target = rawTarget === null ? undefined : parseResourceId(rawTarget, "target");
    const { client } = await getHonchoClient();
    return NextResponse.json(await client.getPeerContext(workspace, peerId, target));
  } catch (error) {
    const status = error instanceof Error && /Invalid (peer|target|workspace)/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load peer context." }, { status });
  }
}
