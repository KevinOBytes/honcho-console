import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { bulkDeleteSchema, runBulkDelete } from "@/lib/bulk-delete";
import { recordChange } from "@/lib/change-journal";
import { parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspace: string }> },
) {
  try {
    const workspace = parseWorkspaceId((await context.params).workspace);
    const input = bulkDeleteSchema.parse(await request.json());
    const { client } = await getHonchoClient();
    const result = await runBulkDelete(input.ids, (id) => client.deleteConclusion(workspace, id));
    for (const id of result.deleted) {
      try {
        await recordChange({ action: "delete", workspace, summary: `Deleted conclusion ${id} (bulk)`, id });
      } catch {
        // Journaling is best-effort.
      }
    }
    return NextResponse.json(result, { status: result.deleted.length === 0 && result.failed.length > 0 ? 502 : 200 });
  } catch (error) {
    const isValidationError = error instanceof z.ZodError || error instanceof SyntaxError || (error instanceof Error && /Invalid workspace/.test(error.message));
    return NextResponse.json(
      { error: error instanceof SyntaxError ? "Malformed JSON body." : error instanceof z.ZodError ? "Bulk delete requires confirm: true and 1-100 valid ids." : error instanceof Error ? error.message : "Unable to delete memories." },
      { status: isValidationError ? 400 : 502 },
    );
  }
}
