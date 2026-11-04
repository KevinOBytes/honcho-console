import { NextRequest, NextResponse } from "next/server";

import { parseResourceId, parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ workspace: string; scopeId: string }> },
) {
  try {
    const params = await context.params;
    const workspace = parseWorkspaceId(params.workspace);
    const scopeId = parseResourceId(params.scopeId, "scope");
    const { client } = await getHonchoClient();
    const scopes = await client.listAllScopes(workspace);
    const scope = scopes.items.find((candidate) => candidate.id === scopeId) ?? null;
    const sessionsPage = await client.listScopeSessions(workspace, scopeId, 1, 100);
    const status = await client.getScopeStatus(workspace, scopeId);
    return NextResponse.json({
      workspace,
      scope,
      sessions: sessionsPage.items.map(({ id, is_active, created_at }) => ({ id, is_active, created_at })),
      session_total: sessionsPage.total,
      status,
    });
  } catch (error) {
    const status = error instanceof Error && /Invalid|must be/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load scope details." }, { status });
  }
}