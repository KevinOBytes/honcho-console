import { NextRequest, NextResponse } from "next/server";

import { parseWorkspaceId } from "@/lib/honcho-client";
import { readChanges } from "@/lib/change-journal";

function parseLimit(value: string | null): number {
  if (value === null) return 100;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 200) {
    throw new Error("Journal limit must be between 1 and 200.");
  }
  return parsed;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspace: string }> },
) {
  try {
    const workspace = parseWorkspaceId((await context.params).workspace);
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const items = await readChanges(limit);
    return NextResponse.json({ workspace, items });
  } catch (error) {
    const status = error instanceof Error && /Invalid workspace|limit must be/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read the change journal." }, { status });
  }
}
