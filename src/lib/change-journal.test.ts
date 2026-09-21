/** @vitest-environment node */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recordChange, readChanges, type ChangeJournalEntry } from "./change-journal";

let journalDir = "";

beforeEach(async () => {
  journalDir = await mkdtemp(path.join(tmpdir(), "honcho-journal-"));
  process.env.HONCHO_CONSOLE_JOURNAL_PATH = path.join(journalDir, "change-journal.jsonl");
});

afterEach(async () => {
  delete process.env.HONCHO_CONSOLE_JOURNAL_PATH;
  await rm(journalDir, { recursive: true, force: true });
});

describe("change journal", () => {
  it("round-trips a recorded change with a timestamp and keeps the file private", async () => {
    await recordChange({
      action: "replace",
      workspace: "oasis",
      summary: "Replaced conclusion conclusion-1",
      id: "conclusion-1",
      before: "old fact",
      after: "new fact",
    });

    const entries = await readChanges();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe("replace");
    expect(entries[0]?.workspace).toBe("oasis");
    expect(entries[0]?.before).toBe("old fact");
    expect(entries[0]?.after).toBe("new fact");
    expect(typeof entries[0]?.at).toBe("string");
    expect(Number.isNaN(new Date(entries[0]!.at).getTime())).toBe(false);

    const journalFile = process.env.HONCHO_CONSOLE_JOURNAL_PATH!;
    const raw = await readFile(journalFile, "utf8");
    expect(raw.split("\n").filter(Boolean)).toHaveLength(1);
  });

  it("appends in order and returns the most recent entries last", async () => {
    const actions: ChangeJournalEntry["action"][] = ["create", "replace", "delete"];
    for (const [index, action] of actions.entries()) {
      await recordChange({ action, workspace: "oasis", summary: `change ${index}` });
    }

    const entries = await readChanges();
    expect(entries.map((entry) => entry.action)).toEqual(actions);
    expect(entries.map((entry) => entry.summary)).toEqual(["change 0", "change 1", "change 2"]);
  });

  it("honors the read limit by returning only the latest entries", async () => {
    for (let index = 0; index < 5; index += 1) {
      await recordChange({ action: "create", workspace: "oasis", summary: `entry ${index}` });
    }

    const entries = await readChanges(2);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.summary)).toEqual(["entry 3", "entry 4"]);
  });

  it("skips malformed lines instead of failing the read", async () => {
    await recordChange({ action: "create", workspace: "oasis", summary: "good entry" });
    const journalPath = process.env.HONCHO_CONSOLE_JOURNAL_PATH!;
    const raw = await readFile(journalPath, "utf8");
    await readFile(journalPath, "utf8");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(journalPath, "{not-json\n" + raw, "utf8");

    const entries = await readChanges();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.summary).toBe("good entry");
  });

  it("creates the parent directory when it does not exist", async () => {
    const nested = path.join(journalDir, "nested", "dir", "journal.jsonl");
    process.env.HONCHO_CONSOLE_JOURNAL_PATH = nested;

    await recordChange({ action: "create", workspace: "oasis", summary: "first" });

    const entries = await readChanges();
    expect(entries).toHaveLength(1);
  });
});
