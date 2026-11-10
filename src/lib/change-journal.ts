import "server-only";

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type ChangeJournalAction = "create" | "replace" | "delete" | "card-update" | "dream" | "session-delete" | "webhook-delete";

export type ChangeJournalEntry = {
  at: string;
  action: ChangeJournalAction;
  workspace: string;
  summary: string;
  id?: string | null;
  peer?: string | null;
  before?: string | null;
  after?: string | null;
  truncated?: boolean;
};

const MAX_SUMMARY_LENGTH = 300;
const MAX_CONTENT_LENGTH = 20_000;
const MAX_ENTRIES_RETURNED = 200;
const MAX_EXPORT_RETURNED = 5_000;

export function journalPath(): string {
  return process.env.HONCHO_CONSOLE_JOURNAL_PATH
    ?? join(homedir(), ".honcho-console", "change-journal.jsonl");
}

function bounded(value: string | null | undefined): { text: string | null; truncated: boolean } {
  if (value === null || value === undefined || value === "") return { text: null, truncated: false };
  if (value.length <= MAX_CONTENT_LENGTH) return { text: value, truncated: false };
  return { text: value.slice(0, MAX_CONTENT_LENGTH), truncated: true };
}

export async function recordChange(
  entry: Omit<ChangeJournalEntry, "at" | "truncated"> & { truncated?: boolean },
): Promise<void> {
  const contentBound = bounded(entry.before ?? null);
  const replacementBound = bounded(entry.after ?? null);
  const record: ChangeJournalEntry = {
    at: new Date().toISOString(),
    action: entry.action,
    workspace: entry.workspace,
    summary: entry.summary.slice(0, MAX_SUMMARY_LENGTH),
    id: entry.id ?? null,
    peer: entry.peer ?? null,
    before: contentBound.text,
    after: replacementBound.text,
    truncated: entry.truncated || contentBound.truncated || replacementBound.truncated,
  };
  const target = journalPath();
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await appendFile(target, `${JSON.stringify(record)}\n`, { mode: 0o600 });
}

export async function readChanges(limit = 50): Promise<ChangeJournalEntry[]> {
  const boundedLimit = Math.min(Math.max(1, Math.trunc(limit)), MAX_ENTRIES_RETURNED);
  return (await readAllEntries()).slice(-boundedLimit);
}

export async function readChangesFiltered(options: { limit?: number; action?: ChangeJournalAction; workspace?: string } = {}): Promise<ChangeJournalEntry[]> {
  const boundedLimit = Math.min(Math.max(1, Math.trunc(options.limit ?? 200)), MAX_EXPORT_RETURNED);
  const all = await readAllEntries();
  const filtered = all.filter((entry) => {
    if (options.action !== undefined && entry.action !== options.action) return false;
    if (options.workspace !== undefined && entry.workspace !== options.workspace) return false;
    return true;
  });
  return filtered.slice(-boundedLimit);
}

async function readAllEntries(): Promise<ChangeJournalEntry[]> {
  let raw: string;
  try {
    raw = await readFile(journalPath(), "utf8");
  } catch {
    return [];
  }
  const entries: ChangeJournalEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as ChangeJournalEntry;
      if (typeof parsed.at === "string" && typeof parsed.action === "string" && typeof parsed.workspace === "string") {
        entries.push(parsed);
      }
    } catch {
      // Tolerate a corrupted or partially written line rather than failing the read.
    }
  }
  return entries;
}
