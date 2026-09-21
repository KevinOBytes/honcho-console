import type { Conclusion } from "./honcho-client";

export type ExportPeerCard = {
  peerId: string;
  facts: string[];
};

export type ExportPayload = {
  workspace: string;
  generatedAt: string;
  truncated: boolean;
  peers: ExportPeerCard[];
  conclusions: Conclusion[];
};

export function buildExportJson(payload: ExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function buildExportMarkdown(payload: ExportPayload): string {
  const lines: string[] = [];
  const status = payload.truncated ? "truncated at export cap" : "complete";
  lines.push(`# Honcho export — ${payload.workspace}`);
  lines.push("");
  lines.push(`Generated: ${payload.generatedAt}`);
  lines.push(`Conclusions exported: ${payload.conclusions.length} (${status})`);
  lines.push("");
  lines.push("## Peer cards");
  lines.push("");
  if (!payload.peers.length) {
    lines.push("_No peers found._");
    lines.push("");
  }
  for (const peer of payload.peers) {
    lines.push(`### ${peer.peerId}`);
    lines.push("");
    if (peer.facts.length) {
      for (const fact of peer.facts) lines.push(`- ${fact}`);
    } else {
      lines.push("_No peer card facts._");
    }
    lines.push("");
  }
  lines.push("## Conclusions");
  lines.push("");
  if (!payload.conclusions.length) {
    lines.push("_No conclusions found._");
    lines.push("");
  }
  let currentRelationship = "";
  for (const conclusion of payload.conclusions) {
    const relationship = `${conclusion.observer_id} → ${conclusion.observed_id}`;
    if (relationship !== currentRelationship) {
      lines.push(`### ${relationship}`);
      lines.push("");
      currentRelationship = relationship;
    }
    const session = conclusion.session_id ? ` · session \`${conclusion.session_id}\`` : "";
    const day = Number.isNaN(new Date(conclusion.created_at).getTime())
      ? "unknown date"
      : conclusion.created_at.slice(0, 10);
    lines.push(`- [${conclusion.level}] ${conclusion.content} (${day}${session})`);
  }
  lines.push("");
  return lines.join("\n");
}
