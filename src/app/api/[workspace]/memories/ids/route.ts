import { NextRequest, NextResponse } from "next/server";

import { collectIds, parseTextFilter } from "@/lib/bulk-delete";
import { parseResourceId, parseWorkspaceId, type ConclusionFilters } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

const LEVELS = ["explicit", "deductive", "inductive", "contradiction"] as const;

/** Read-only: returns every conclusion id matching the browse filters, for "select all matching". */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspace: string }> },
) {
  try {
    const workspace = parseWorkspaceId((await context.params).workspace);
    const params = request.nextUrl.searchParams;
    const filters: ConclusionFilters = {};
    const observer = params.get("observer_id")?.trim();
    const observed = params.get("observed_id")?.trim();
    const session = params.get("session_id")?.trim();
    const level = params.get("level");
    if (observer) filters.observer_id = parseResourceId(observer, "observer");
    if (observed) filters.observed_id = parseResourceId(observed, "observed");
    if (session) filters.session_id = parseResourceId(session, "session");
    if (level) {
      if (!LEVELS.includes(level as (typeof LEVELS)[number])) throw new Error("Invalid memory level.");
      filters.level = level as (typeof LEVELS)[number];
    }
    const contains = parseTextFilter(params.get("contains"));
    if (contains) filters.contains = contains;
    const { client } = await getHonchoClient();
    return NextResponse.json(await collectIds((page) => client.listConclusions(workspace, { page, size: 100, filters })));
  } catch (error) {
    const status = error instanceof Error && /Invalid/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to collect memory ids." }, { status });
  }
}
