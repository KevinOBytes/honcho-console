import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseResourceId, parseWorkspaceId } from "@/lib/honcho-client";
import { replaceConclusion } from "@/lib/conclusion-mutations";
import { getHonchoClient } from "@/lib/server";

const replaceSchema = z.object({
  content: z.string().trim().min(1).max(65_535),
  observer_id: z.string().trim().min(1).max(512).refine((value) => /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid observer identifier."),
  observed_id: z.string().trim().min(1).max(512).refine((value) => /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid observed identifier."),
  session_id: z.string().trim().max(512).nullable().optional().refine((value) => value === null || value === undefined || /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid session identifier."),
  original: z.object({
    id: z.string().trim().min(1).max(512).refine((value) => /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid memory identifier."),
    content: z.string(),
    observer_id: z.string().trim().min(1).max(512).refine((value) => /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid observer identifier."),
    observed_id: z.string().trim().min(1).max(512).refine((value) => /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid observed identifier."),
    session_id: z.string().trim().max(512).nullable().refine((value) => value === null || /^[a-zA-Z0-9_-]{1,512}$/.test(value), "Invalid session identifier."),
    level: z.enum(["explicit", "deductive", "inductive", "contradiction"]),
    created_at: z.string(),
  }),
});

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ workspace: string; memoryId: string }> },
) {
  try {
    const params = await context.params;
    const workspace = parseWorkspaceId(params.workspace);
    const memoryId = parseResourceId(params.memoryId, "memory");
    const { client } = await getHonchoClient();
    await client.deleteConclusion(workspace, memoryId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const status = error instanceof Error && /Invalid (memory|workspace)/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete memory." }, { status });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ workspace: string; memoryId: string }> },
) {
  try {
    const params = await context.params;
    const workspace = parseWorkspaceId(params.workspace);
    const memoryId = parseResourceId(params.memoryId, "memory");
    const input = replaceSchema.parse(await request.json());
    if (input.original.id !== memoryId) {
      return NextResponse.json({ error: "Memory identity mismatch." }, { status: 400 });
    }
    const { client } = await getHonchoClient();
    const replacement = await replaceConclusion({
      original: input.original,
      content: input.content,
      observer_id: input.observer_id,
      observed_id: input.observed_id,
      session_id: input.session_id,
      create: (createInput) => client.createConclusion(workspace, createInput),
      remove: (id) => client.deleteConclusion(workspace, id),
    });
    return NextResponse.json(replacement);
  } catch (error) {
    const isValidationError = error instanceof z.ZodError
      || error instanceof SyntaxError
      || (error instanceof Error && /Invalid (memory|observer|observed|session|workspace)/.test(error.message));
    const status = isValidationError ? 400 : 502;
    return NextResponse.json({ error: error instanceof SyntaxError ? "Malformed JSON body." : error instanceof Error ? error.message : "Unable to replace memory." }, { status });
  }
}
