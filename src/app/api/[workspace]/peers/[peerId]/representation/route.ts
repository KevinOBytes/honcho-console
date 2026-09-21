import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseResourceId, parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

const representationSchema = z.object({
  target: z.string().trim().max(512).optional().refine((value) => value === undefined || /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid target identifier."),
  session_id: z.string().trim().max(512).optional().refine((value) => value === undefined || /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid session identifier."),
  search_query: z.string().trim().max(500).optional(),
  search_top_k: z.number().int().min(1).max(100).optional(),
  search_max_distance: z.number().min(0).max(1).optional(),
  include_most_frequent: z.boolean().optional(),
  max_conclusions: z.number().int().min(1).max(100).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspace: string; peerId: string }> },
) {
  try {
    const params = await context.params;
    const workspace = parseWorkspaceId(params.workspace);
    const peerId = parseResourceId(params.peerId, "peer");
    const input = representationSchema.parse(await request.json().catch(() => ({})));
    const { client } = await getHonchoClient();
    const result = await client.getWorkingRepresentation(workspace, peerId, {
      target: input.target,
      sessionId: input.session_id,
      searchQuery: input.search_query,
      searchTopK: input.search_top_k,
      searchMaxDistance: input.search_max_distance,
      includeMostFrequent: input.include_most_frequent,
      maxConclusions: input.max_conclusions,
    });
    return NextResponse.json(result);
  } catch (error) {
    const isValidationError = error instanceof z.ZodError
      || error instanceof SyntaxError
      || (error instanceof Error && /Invalid|must be/i.test(error.message));
    const status = isValidationError ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to build the working representation." }, { status });
  }
}
