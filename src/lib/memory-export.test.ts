/** @vitest-environment node */

import { describe, expect, it } from "vitest";

import { buildExportJson, buildExportMarkdown, type ExportPayload } from "./memory-export";

const payload: ExportPayload = {
  workspace: "oasis",
  generatedAt: "2026-09-20T18:30:00.000Z",
  truncated: false,
  peers: [{ peerId: "hermes", facts: ["Runs local models", "Uses Honcho via OrbStack"] }, { peerId: "kevo", facts: [] }],
  conclusions: [
    {
      id: "conclusion-1",
      content: "Kevin prefers local models.",
      observer_id: "hermes",
      observed_id: "kevo",
      session_id: "session-9",
      level: "explicit",
      created_at: "2026-09-10T12:00:00Z",
    },
  ],
};

describe("memory export", () => {
  it("builds a stable JSON export", () => {
    const parsed = JSON.parse(buildExportJson(payload)) as ExportPayload;
    expect(parsed.workspace).toBe("oasis");
    expect(parsed.generatedAt).toBe(payload.generatedAt);
    expect(parsed.peers).toHaveLength(2);
    expect(parsed.conclusions).toHaveLength(1);
  });

  it("renders peer cards and conclusions as markdown sections", () => {
    const markdown = buildExportMarkdown(payload);
    expect(markdown).toContain("# Honcho export — oasis");
    expect(markdown).toContain("Generated: 2026-09-20T18:30:00.000Z");
    expect(markdown).toContain("Conclusions exported: 1 (complete)");
    expect(markdown).toContain("### hermes");
    expect(markdown).toContain("- Runs local models");
    expect(markdown).toContain("### kevo");
    expect(markdown).toContain("_No peer card facts._");
    expect(markdown).toContain("### hermes → kevo");
    expect(markdown).toContain("- [explicit] Kevin prefers local models.");
    expect(markdown).toContain("session-9");
    expect(markdown).toContain("2026-09-10");
  });

  it("marks truncated exports", () => {
    const markdown = buildExportMarkdown({ ...payload, truncated: true });
    expect(markdown).toContain("(truncated at export cap)");

    const parsed = JSON.parse(buildExportJson({ ...payload, truncated: true })) as ExportPayload;
    expect(parsed.truncated).toBe(true);
  });

  it("handles an empty workspace without sections", () => {
    const markdown = buildExportMarkdown({ workspace: "empty", generatedAt: "2026-09-20T00:00:00Z", truncated: false, peers: [], conclusions: [] });
    expect(markdown).toContain("Conclusions exported: 0 (complete)");
    expect(markdown).toContain("_No conclusions found._");
  });
});
