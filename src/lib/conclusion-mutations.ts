export type ConclusionRecord = {
  id: string;
  content: string;
  observer_id: string;
  observed_id: string;
  session_id: string | null;
  level: "explicit" | "deductive" | "inductive" | "contradiction";
  created_at: string;
};

type ReplaceConclusionInput = {
  original: ConclusionRecord;
  content: string;
  observer_id?: string;
  observed_id?: string;
  session_id?: string | null;
  create: (input: {
    content: string;
    observer_id: string;
    observed_id: string;
    session_id: string | null;
  }) => Promise<ConclusionRecord>;
  remove: (id: string) => Promise<void>;
};

export async function replaceConclusion({
  original,
  content,
  observer_id,
  observed_id,
  session_id,
  create,
  remove,
}: ReplaceConclusionInput): Promise<ConclusionRecord> {
  const replacement = await create({
    content,
    observer_id: observer_id ?? original.observer_id,
    observed_id: observed_id ?? original.observed_id,
    session_id: session_id === undefined ? original.session_id : session_id,
  });

  try {
    await remove(original.id);
  } catch (error) {
    try {
      await remove(replacement.id);
    } catch (rollbackError) {
      const originalDetail = error instanceof Error ? error.message : String(error);
      const rollbackDetail = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      throw new Error(
        `Unable to delete original conclusion (${original.id}): ${originalDetail}. `
        + `Rollback also failed for replacement ${replacement.id}: ${rollbackDetail}`,
      );
    }
    throw error;
  }

  return replacement;
}
