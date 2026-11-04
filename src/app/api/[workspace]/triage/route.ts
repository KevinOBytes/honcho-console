import { NextRequest, NextResponse } from "next/server";

import { parseResourceId, parseWorkspaceId, type Conclusion } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";
import { findDuplicateGroups, type TriageConclusion } from "@/lib/memory-triage";

const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const MAX_ITEMS = 5_000;
const MAX_GROUPS_RETURNED = 100;
const MAX_DISPLAY_CONTENT = 300;

function parseResourceFilter(value: string | null, label: string): string | undefined {
  if (value === null || value === "") return undefined;
  return parseResourceId(value, label);
}

function parseGroupLimit(value: string | null): number {
  if (value === null) return MAX_GROUPS_RETURNED;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_GROUPS_RETURNED) {
    throw new Error(`Triage limit must be between 1 and ${MAX_GROUPS_RETURNED}.`);
  }
  return parsed;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspace: string }> },
) {
  try {
    const workspace = parseWorkspaceId((await context.params).workspace);
    const observerId = parseResourceFilter(request.nextUrl.searchParams.get("observer_id"), "observer");
    const observedId = parseResourceFilter(request.nextUrl.searchParams.get("observed_id"), "observed");
    const limit = parseGroupLimit(request.nextUrl.searchParams.get("limit"));

    const { client } = await getHonchoClient();
    const first = await client.listConclusions(workspace, {
      page: 1,
      size: PAGE_SIZE,
      filters: { observer_id: observerId, observed_id: observedId },
    });
    const pageLimit = Math.min(first.pages, MAX_PAGES);
    let conclusions: Conclusion[] = first.items.slice(0, MAX_ITEMS);
    for (let page = 2; page <= pageLimit && conclusions.length < MAX_ITEMS; page += 1) {
      const next = await client.listConclusions(workspace, { page, size: PAGE_SIZE, filters: { observer_id: observerId, observed_id: observedId } });
      conclusions = [...conclusions, ...next.items].slice(0, MAX_ITEMS);
    }
    const truncated = first.total > conclusions.length;

    const triageInput: TriageConclusion[] = conclusions.map((conclusion) => ({
      id: conclusion.id,
      observer_id: conclusion.observer_id,
      observed_id: conclusion.observed_id,
      level: conclusion.level,
      times_derived: conclusion.times_derived,
      created_at: conclusion.created_at,
      content: conclusion.content,
    }));
    const groups = findDuplicateGroups(triageInput).slice(0, limit);
    return NextResponse.json({
      workspace,
      analyzed: conclusions.length,
      totalAvailable: first.total,
      truncated,
      groups: groups.map((group) => ({
        observer_id: group.observer_id,
        observed_id: group.observed_id,
        maxSimilarity: group.maxSimilarity,
        members: group.members.map((member) => ({
          id: member.id,
          level: member.level,
          times_derived: member.times_derived,
          created_at: member.created_at,
          content: member.content.length > MAX_DISPLAY_CONTENT ? `${member.content.slice(0, MAX_DISPLAY_CONTENT)}...` : member.content,
        })),
      })),
    });
  } catch (error) {
    const status = error instanceof Error && /Invalid|must be/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to compute memory triage." }, { status });
  }
}