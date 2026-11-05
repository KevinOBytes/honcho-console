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
    const scopes = await client.listAllScopes(workspace);
    return NextResponse.json({
      workspace,
      scopes: scopes.items.map(({ id, created_at, session_count, metadata }) => ({ id, created_at, session_count, metadata })),
      total: scopes.total,
      truncated: scopes.truncated,
    });
  } catch (error) {
    const status = error instanceof Error && /Invalid|must be/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to list scopes." }, { status });
  }
}