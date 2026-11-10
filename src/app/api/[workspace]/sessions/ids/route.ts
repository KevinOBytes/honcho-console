import { NextRequest, NextResponse } from "next/server";

import { collectIds, parseTextFilter } from "@/lib/bulk-delete";
import { parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

/** Read-only: returns every session id matching the id search, for "select all matching". */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspace: string }> },
) {
  try {
    const workspace = parseWorkspaceId((await context.params).workspace);
    const contains = parseTextFilter(request.nextUrl.searchParams.get("contains"));
    const { client } = await getHonchoClient();
    return NextResponse.json(await collectIds((page) => client.listSessions(workspace, page, 100, contains ? { id_contains: contains } : undefined)));
  } catch (error) {
    const status = error instanceof Error && /Invalid/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to collect session ids." }, { status });
  }
}
