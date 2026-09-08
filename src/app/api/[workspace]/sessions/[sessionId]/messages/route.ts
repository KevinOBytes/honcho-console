import { NextRequest, NextResponse } from "next/server";

import { parseResourceId, parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

function parsePagination(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new Error("Invalid pagination value.");
  return parsed;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspace: string; sessionId: string }> },
) {
  try {
    const params = await context.params;
    const workspace = parseWorkspaceId(params.workspace);
    const sessionId = parseResourceId(params.sessionId, "session");
    const page = parsePagination(request.nextUrl.searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
    const size = parsePagination(request.nextUrl.searchParams.get("size"), 50, 100);
    const { client } = await getHonchoClient();
    return NextResponse.json(await client.listMessages(workspace, sessionId, page, size));
  } catch (error) {
    const status = error instanceof Error && /Invalid (pagination|workspace|session)/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load messages." }, { status });
  }
}
