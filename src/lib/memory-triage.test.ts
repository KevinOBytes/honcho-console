import { describe, expect, it } from "vitest";

import { findDuplicateGroups, type TriageConclusion } from "./memory-triage";
import { jaccard, textSimilarity, tokenize } from "./text-similarity";

function conclusion(partial: Partial<TriageConclusion> & { id: string; content: string }): TriageConclusion {
  return {
    observer_id: "hermes",
    observed_id: "kevo",
    level: "explicit",
    times_derived: 1,
    created_at: "2026-09-01T00:00:00Z",
    ...partial,
  };
}

describe("tokenize and jaccard", () => {
  it("tokenizes case-insensitively and ignores punctuation", () => {
    expect(tokenize("Kevin loves Honcho!")).toEqual(new Set(["kevin", "loves", "honcho"]));
  });

  it("returns identity for identical text and zero for disjoint text", () => {
    expect(jaccard(tokenize("a b c"), tokenize("a b c"))).toBe(1);
    expect(jaccard(tokenize("a b c"), tokenize("d e f"))).toBe(0);
  });

  it("returns 1 for two empty token sets", () => {
    expect(jaccard(new Set(), new Set())).toBe(1);
  });

  it("computes a high similarity for near-duplicate phrasing", () => {
    expect(textSimilarity("Kevin prefers direct practical prose", "Kevin prefers direct, practical prose.")).toBeGreaterThan(0.8);
  });
});

describe("findDuplicateGroups", () => {
  it("groups near-duplicate conclusions under one observer/observed pair", () => {
    const groups = findDuplicateGroups([
      conclusion({ id: "a", content: "Kevin prefers direct practical prose over flattery" }),
      conclusion({ id: "b", content: "Kevin prefers direct, practical prose over flattery" }),
      conclusion({ id: "c", content: "Kevin hates verbose filler and flattery everywhere" }),
      conclusion({ id: "d", content: "Kevin prefers direct practical prose over flattery, always" }),
    ]);
    const singles = groups.filter((group) => group.members.length === 1);
    expect(singles).toHaveLength(0);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((member) => member.id)).toEqual(["a", "b", "d"]);
    expect(groups[0].observer_id).toBe("hermes");
    expect(groups[0].observed_id).toBe("kevo");
  });

  it("never merges across different observed peers", () => {
    const groups = findDuplicateGroups([
      conclusion({ id: "a", content: "prefers direct practical prose over flattery" }),
      conclusion({ id: "b", observed_id: "becka", content: "prefers direct practical prose over flattery" }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("orders members oldest first and groups by descending similarity", () => {
    const groups = findDuplicateGroups([
      conclusion({ id: "late", created_at: "2026-09-03T00:00:00Z", content: "identical duplicated sentence here" }),
      conclusion({ id: "early", created_at: "2026-09-01T00:00:00Z", content: "identical duplicated sentence here" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((member) => member.id)).toEqual(["early", "late"]);
    expect(groups[0].maxSimilarity).toBe(1);
  });

  it("is bounded per pair and flags no false positives at the default threshold", () => {
    const items: TriageConclusion[] = [];
    for (let index = 0; index < 40; index += 1) {
      items.push(conclusion({ id: `i-${index}`, content: `unique sentence number ${index} padding padding` }));
    }
    const groups = findDuplicateGroups(items);
    expect(groups).toHaveLength(0);
  });
});