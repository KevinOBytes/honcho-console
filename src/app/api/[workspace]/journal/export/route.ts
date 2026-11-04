import { NextRequest, NextResponse } from "next/server";

import { parseWorkspaceId } from "@/lib/honcho-client";
import { readChangesFiltered, type ChangeJournalAction } from "@/lib/change-journal";

const ACTIONS: ChangeJournalAction[] = ["create", "replace", "delete", "card-update", "dream"];

function parseLimit(value: string | null): number {
  if (value === null) return 5_000;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 5_000) {
    throw new Error("Journal export limit must be between 1 and 5000.");
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
    const actionValue = request.nextUrl.searchParams.get("action");
    const action: ChangeJournalAction | undefined = actionValue === null || actionValue === ""
      ? undefined
      : ACTIONS.includes(actionValue as ChangeJournalAction)
        ? (actionValue as ChangeJournalAction)
        : (() => { throw new Error("Journal export action must be one of: create, replace, delete, card-update, dream."); })();
    const journalWorkspace = request.nextUrl.searchParams.get("workspace");
    if (journalWorkspace !== null && journalWorkspace !== "") {
      parseWorkspaceId(journalWorkspace);
    }
    const items = await readChangesFiltered({ limit, action, workspace: journalWorkspace ?? undefined });
    const body = `${items.map((entry) => JSON.stringify(entry)).join("\n")}${items.length > 0 ? "\n" : ""}`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "content-disposition": `attachment; filename="honcho-console-journal-${workspace}.jsonl"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const status = error instanceof Error && /Invalid|must be/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to export the change journal." }, { status });
  }
}