import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseResourceId, parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";
import { recordChange } from "@/lib/change-journal";

const dreamSchema = z.object({
  observer: z.string().trim().min(1).max(512).refine((value) => /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid observer identifier."),
  observed: z.string().trim().max(512).optional().refine((value) => value === undefined || /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid observed identifier."),
  dream_type: z.enum(["omni", "card_refresh"]),
  session_id: z.string().trim().max(512).optional().refine((value) => value === undefined || /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid session identifier."),
  rebuild: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspace: string }> },
) {
  try {
    const workspace = parseWorkspaceId((await context.params).workspace);
    const input = dreamSchema.parse(await request.json());
    const { client } = await getHonchoClient();
    await client.scheduleDream(workspace, {
      observer: input.observer,
      observed: input.observed,
      dreamType: input.dream_type,
      sessionId: input.session_id,
      rebuild: input.rebuild,
    });
    const queue = await client.getQueueStatus(workspace);
    try {
      await recordChange({
        action: "dream",
        workspace,
        summary: `Scheduled ${input.dream_type} dream for ${input.observer}${input.observed ? ` → ${input.observed}` : ""}${input.rebuild ? " (rebuild card from remaining observations)" : ""}`,
        peer: input.observer,
        after: `dream_type=${input.dream_type} rebuild=${Boolean(input.rebuild)}`,
      });
    } catch {
      // Journaling is best-effort.
    }
    return NextResponse.json({ ok: true, queue });
  } catch (error) {
    const isValidationError = error instanceof z.ZodError
      || error instanceof SyntaxError
      || (error instanceof Error && /Invalid|Unsupported|must be/i.test(error.message));
    const status = isValidationError ? 400 : 502;
    return NextResponse.json({ error: error instanceof SyntaxError ? "Malformed JSON body." : error instanceof Error ? error.message : "Unable to schedule the dream." }, { status });
  }
}
