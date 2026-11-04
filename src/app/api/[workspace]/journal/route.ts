import { NextRequest, NextResponse } from "next/server";

import { parseWorkspaceId } from "@/lib/honcho-client";
import { readChangesFiltered, type ChangeJournalAction } from "@/lib/change-journal";

const ACTIONS: ChangeJournalAction[] = ["create", "replace", "delete", "card-update", "dream"];

function parseLimit(value: string | null): number {
  if (value === null) return 100;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 200) {
    throw new Error("Journal limit must be between 1 and 200.");
  }
  return parsed;
}

function parseAction(value: string | null): ChangeJournalAction | undefined {
  if (value === null || value === "") return undefined;
  if (!ACTIONS.includes(value as ChangeJournalAction)) {
    throw new Error(`Journal action must be one of: ${ACTIONS.join(", ")}.`);
  }
  return value as ChangeJournalAction;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspace: string }> },
) {
  try {
    const workspace = parseWorkspaceId((await context.params).workspace);
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const action = parseAction(request.nextUrl.searchParams.get("action"));
    const journalWorkspace = request.nextUrl.searchParams.get("workspace");
    if (journalWorkspace !== null && journalWorkspace !== "") {
      parseWorkspaceId(journalWorkspace);
    }
    const items = await readChangesFiltered({ limit, action, workspace: journalWorkspace ?? undefined });
    return NextResponse.json({ workspace, items });
  } catch (error) {
    const status = error instanceof Error && /Invalid workspace|limit must be|action must be/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read the change journal." }, { status });
  }
}
