import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseResourceId, parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

const createSchema = z.object({
  content: z.string().trim().min(1).max(65_535),
  observer_id: z.string().trim().min(1).max(512).refine((value) => /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid observer identifier."),
  observed_id: z.string().trim().min(1).max(512).refine((value) => /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid observed identifier."),
  session_id: z.string().trim().max(512).nullable().optional().refine((value) => value === null || value === undefined || /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid session identifier."),
});

function parsePagination(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error("Invalid pagination value.");
  }
  return parsed;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspace: string }> },
) {
  try {
    const workspace = parseWorkspaceId((await context.params).workspace);
    const params = request.nextUrl.searchParams;
    const page = parsePagination(params.get("page"), 1, Number.MAX_SAFE_INTEGER);
    const size = parsePagination(params.get("size"), 50, 100);
    const query = params.get("query")?.trim() ?? "";
    if (query.length > 500) {
      return NextResponse.json({ error: "Search query must be between 1 and 500 characters." }, { status: 400 });
    }
    const levelValue = params.get("level");
    const validLevels = ["explicit", "deductive", "inductive", "contradiction"] as const;
    if (levelValue && !validLevels.includes(levelValue as (typeof validLevels)[number])) {
      return NextResponse.json({ error: "Invalid memory level." }, { status: 400 });
    }
    const level = levelValue as (typeof validLevels)[number] | null;
    const { client } = await getHonchoClient();
    if (query) {
      const observerParam = params.get("observer_id")?.trim() ?? "";
      const observedParam = params.get("observed_id")?.trim() ?? "";
      if (!observerParam || !observedParam) {
        return NextResponse.json(
          { error: "Semantic search requires both an observer and an observed peer." },
          { status: 400 },
        );
      }
      let observer: string;
      let observed: string;
      try {
        observer = parseResourceId(observerParam, "observer");
        observed = parseResourceId(observedParam, "observed");
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid search relationship." }, { status: 400 });
      }
      const items = await client.queryConclusions(
        workspace,
        query,
        { observer, observed, ...(level ? { level } : {}) },
        Math.min(size, 100),
      );
      return NextResponse.json({ items, total: items.length, page: 1, size: Math.max(items.length, 1), pages: 1, mode: "semantic" });
    }

    const observerParam = params.get("observer_id")?.trim() ?? "";
    const observedParam = params.get("observed_id")?.trim() ?? "";
    let observer: string | undefined;
    let observed: string | undefined;
    try {
      observer = observerParam ? parseResourceId(observerParam, "observer") : undefined;
      observed = observedParam ? parseResourceId(observedParam, "observed") : undefined;
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid memory relationship." }, { status: 400 });
    }
    const pageData = await client.listConclusions(workspace, {
      page,
      size,
      filters: {
        ...(observer ? { observer_id: observer } : {}),
        ...(observed ? { observed_id: observed } : {}),
        ...(level ? { level } : {}),
      },
    });
    return NextResponse.json({ ...pageData, mode: "recent" });
  } catch (error) {
    const status = error instanceof Error && /Invalid (pagination|observer|observed|workspace)|Semantic search requires|Search query must be between/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load memories." }, { status });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspace: string }> },
) {
  try {
    const workspace = parseWorkspaceId((await context.params).workspace);
    const input = createSchema.parse(await request.json());
    const { client } = await getHonchoClient();
    const created = await client.createConclusion(workspace, input);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const isValidationError = error instanceof z.ZodError || error instanceof SyntaxError;
    const status = isValidationError ? 400 : 502;
    return NextResponse.json({ error: error instanceof SyntaxError ? "Malformed JSON body." : error instanceof Error ? error.message : "Unable to create memory." }, { status });
  }
}
