import { NextRequest, NextResponse } from "next/server";

import { parseWorkspaceId } from "@/lib/honcho-client";
import { getHonchoClient } from "@/lib/server";
import { buildExportJson, buildExportMarkdown, type ExportPayload } from "@/lib/memory-export";

const PAGE_SIZE = 100;
const MAX_CONCLUSION_PAGES = 100;
const MAX_CONCLUSIONS = 10_000;
const MAX_PEER_PAGES = 20;
const MAX_CARD_PEERS = 500;

function exportFilename(workspace: string, extension: string): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `honcho-${workspace}-${day}-export.${extension}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspace: string }> },
) {
  try {
    const workspace = parseWorkspaceId((await context.params).workspace);
    const format = (request.nextUrl.searchParams.get("format") ?? "json").toLowerCase();
    if (format !== "json" && format !== "markdown" && format !== "md") {
      return NextResponse.json({ error: "Unsupported export format. Use json or markdown." }, { status: 400 });
    }

    const { client } = await getHonchoClient();

    const conclusionsFirst = await client.listConclusions(workspace, { page: 1, size: PAGE_SIZE });
    const conclusionPageLimit = Math.min(conclusionsFirst.pages, MAX_CONCLUSION_PAGES);
    let conclusions = conclusionsFirst.items.slice(0, MAX_CONCLUSIONS);
    for (let page = 2; page <= conclusionPageLimit && conclusions.length < MAX_CONCLUSIONS; page += 1) {
      const next = await client.listConclusions(workspace, { page, size: PAGE_SIZE });
      conclusions = [...conclusions, ...next.items].slice(0, MAX_CONCLUSIONS);
    }

    const peersFirst = await client.listPeers(workspace, 1, PAGE_SIZE);
    const peerPageLimit = Math.min(peersFirst.pages, MAX_PEER_PAGES);
    let peers = peersFirst.items;
    for (let page = 2; page <= peerPageLimit; page += 1) {
      const next = await client.listPeers(workspace, page, PAGE_SIZE);
      peers = [...peers, ...next.items];
    }

    const cardPeers = peers.slice(0, MAX_CARD_PEERS);
    const cards = await Promise.all(
      cardPeers.map(async (peer) => {
        try {
          const context = await client.getPeerContext(workspace, peer.id);
          return { peerId: peer.id, facts: context.peer_card ?? [] };
        } catch {
          return { peerId: peer.id, facts: [] };
        }
      }),
    );

    const payload: ExportPayload = {
      workspace,
      generatedAt: new Date().toISOString(),
      truncated: conclusionsFirst.total > conclusions.length || peersFirst.total > MAX_CARD_PEERS,
      peers: cards,
      conclusions,
    };

    const isMarkdown = format !== "json";
    const body = isMarkdown ? buildExportMarkdown(payload) : buildExportJson(payload);
    const filename = exportFilename(workspace, isMarkdown ? "md" : "json");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": isMarkdown ? "text/markdown; charset=utf-8" : "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const status = error instanceof Error && /Invalid workspace/.test(error.message) ? 400 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to export memory." }, { status });
  }
}
