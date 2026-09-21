import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseResourceId, parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

const searchSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspace: string }> },
) {
  try {
    const workspace = parseWorkspaceId((await context.params).workspace);
    const input = searchSchema.parse(await request.json());
    const { client } = await getHonchoClient();
    const items = await client.searchMessages(workspace, input.query, input.limit ?? 20);
    return NextResponse.json({ items, mode: "message-search" });
  } catch (error) {
    const isValidationError = error instanceof z.ZodError
      || error instanceof SyntaxError
      || (error instanceof Error && /Invalid|must be/i.test(error.message));
    const status = isValidationError ? 400 : 502;
    return NextResponse.json({ error: error instanceof SyntaxError ? "Malformed JSON body." : error instanceof Error ? error.message : "Unable to search messages." }, { status });
  }
}
