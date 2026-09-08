import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  MAX_PEER_CARD_BYTES,
  MAX_PEER_CARD_FACTS,
  MAX_PEER_CARD_FACT_LENGTH,
  parseResourceId,
  parseWorkspaceId,
} from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

const cardSchema = z.object({
  facts: z.array(z.string().trim().min(1).max(MAX_PEER_CARD_FACT_LENGTH)).max(MAX_PEER_CARD_FACTS),
}).superRefine((input, context) => {
  if (new TextEncoder().encode(JSON.stringify(input.facts)).length > MAX_PEER_CARD_BYTES) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Peer card payload is too large." });
  }
});

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ workspace: string; peerId: string }> },
) {
  try {
    const params = await context.params;
    const workspace = parseWorkspaceId(params.workspace);
    const peerId = parseResourceId(params.peerId, "peer");
    const input = cardSchema.parse(await request.json());
    const rawTarget = request.nextUrl.searchParams.get("target");
    const target = rawTarget === null ? undefined : parseResourceId(rawTarget, "target");
    const { client } = await getHonchoClient();
    const peerCard = await client.setPeerCard(workspace, peerId, input.facts, target);
    return NextResponse.json({ peer_card: peerCard });
  } catch (error) {
    const isValidationError = error instanceof z.ZodError
      || error instanceof SyntaxError
      || (error instanceof Error && /Invalid (peer|target|workspace)|Peer card/.test(error.message));
    const status = isValidationError ? 400 : 502;
    return NextResponse.json({ error: error instanceof SyntaxError ? "Malformed JSON body." : error instanceof Error ? error.message : "Unable to save peer card." }, { status });
  }
}
