import { describe, expect, it, vi } from "vitest";

import { replaceConclusion } from "./conclusion-mutations";

describe("replaceConclusion", () => {
  const original = {
    id: "old-memory",
    content: "old content",
    observer_id: "hermes",
    observed_id: "kevo",
    session_id: null,
    level: "explicit" as const,
    created_at: "2026-09-04T00:00:00Z",
  };

  it("creates the replacement before deleting the original", async () => {
    const events: string[] = [];
    const replacement = { ...original, id: "new-memory", content: "new content" };
    const create = vi.fn(async () => {
      events.push("create");
      return replacement;
    });
    const remove = vi.fn(async (id: string) => {
      events.push(`delete:${id}`);
    });

    await expect(
      replaceConclusion({
        original,
        content: "new content",
        create,
        remove,
      }),
    ).resolves.toEqual(replacement);

    expect(events).toEqual(["create", "delete:old-memory"]);
  });

  it("passes edited relationship fields into the replacement", async () => {
    const create = vi.fn(async (input) => ({
      ...original,
      ...input,
      id: "new-memory",
    }));

    await replaceConclusion({
      original,
      content: "new content",
      observer_id: "kevo",
      observed_id: "hermes",
      session_id: "session-2",
      create,
      remove: vi.fn(async () => undefined),
    });

    expect(create).toHaveBeenCalledWith({
      content: "new content",
      observer_id: "kevo",
      observed_id: "hermes",
      session_id: "session-2",
    });
  });

  it("rolls back the replacement if deleting the original fails", async () => {
    const replacement = { ...original, id: "new-memory", content: "new content" };
    const remove = vi
      .fn<(id: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("original delete failed"))
      .mockResolvedValueOnce(undefined);

    await expect(
      replaceConclusion({
        original,
        content: "new content",
        create: vi.fn(async () => replacement),
        remove,
      }),
    ).rejects.toThrow("original delete failed");

    expect(remove).toHaveBeenNthCalledWith(1, "old-memory");
    expect(remove).toHaveBeenNthCalledWith(2, "new-memory");
  });

  it("reports a rollback failure and replacement ID when cleanup also fails", async () => {
    const replacement = { ...original, id: "new-memory", content: "new content" };
    const remove = vi
      .fn<(id: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("original delete failed"))
      .mockRejectedValueOnce(new Error("rollback delete failed"));

    await expect(
      replaceConclusion({
        original,
        content: "new content",
        create: vi.fn(async () => replacement),
        remove,
      }),
    ).rejects.toThrow(/original delete failed.*Rollback also failed.*new-memory.*rollback delete failed/);
  });
});
