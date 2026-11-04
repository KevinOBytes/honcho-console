import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { MAX_DIALECTIC_QUERY_LENGTH, REASONING_LEVELS, parseResourceId, parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

const chatSchema = z.object({
  query: z.string().trim().min(1).max(MAX_DIALECTIC_QUERY_LENGTH),
  target: z.string().trim().max(512).optional().refine((value) => value === undefined || /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid target identifier."),
  session_id: z.string().trim().max(512).optional().refine((value) => value === undefined || /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid session identifier."),
  reasoning_level: z.enum(REASONING_LEVELS).optional(),
  stream: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspace: string; peerId: string }> },
) {
  try {
    const params = await context.params;
    const workspace = parseWorkspaceId(params.workspace);
    const peerId = parseResourceId(params.peerId, "peer");
    const input = chatSchema.parse(await request.json());
    const { client } = await getHonchoClient();
    if (input.stream === true) {
      const upstream = await client.chatWithPeer(workspace, peerId, {
        query: input.query,
        target: input.target,
        sessionId: input.session_id,
        reasoningLevel: input.reasoning_level,
        stream: true,
      });
      if (!(upstream instanceof Response)) {
        throw new Error("The Honcho server returned a non-stream response for a streaming request.");
      }
      const headers = new Headers();
      headers.set("Content-Type", upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8");
      headers.set("Cache-Control", "no-cache, no-transform");
      headers.set("X-Accel-Buffering", "no");
      return new NextResponse(upstream.body, { status: 200, headers });
    }
    const answer = await client.chatWithPeer(workspace, peerId, {
      query: input.query,
      target: input.target,
      sessionId: input.session_id,
      reasoningLevel: input.reasoning_level,
    });
    return NextResponse.json(answer);
  } catch (error) {
    const isValidationError = error instanceof z.ZodError
      || error instanceof SyntaxError
      || (error instanceof Error && /Invalid|must be|Unsupported/i.test(error.message));
    const status = isValidationError ? 400 : 502;
    return NextResponse.json({ error: error instanceof SyntaxError ? "Malformed JSON body." : error instanceof Error ? error.message : "Unable to complete the dialectic request." }, { status });
  }
}
