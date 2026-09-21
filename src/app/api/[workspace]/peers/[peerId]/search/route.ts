import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseResourceId, parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

const peerSearchSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspace: string; peerId: string }> },
) {
  try {
    const params = await context.params;
    const workspace = parseWorkspaceId(params.workspace);
    const peerId = parseResourceId(params.peerId, "peer");
    const input = peerSearchSchema.parse(await request.json());
    const { client } = await getHonchoClient();
    const items = await client.searchPeerMessages(workspace, peerId, input.query, input.limit ?? 20);
    return NextResponse.json({ items });
  } catch (error) {
    const isValidationError = error instanceof z.ZodError
      || error instanceof SyntaxError
      || (error instanceof Error && /Invalid|must be/i.test(error.message));
    const status = isValidationError ? 400 : 502;
    return NextResponse.json({ error: error instanceof SyntaxError ? "Malformed JSON body." : error instanceof Error ? error.message : "Unable to search peer messages." }, { status });
  }
}
