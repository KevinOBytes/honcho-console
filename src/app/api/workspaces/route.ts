import { NextResponse } from "next/server";

import { getHonchoClient } from "@/lib/server";

export async function GET() {
  try {
    const { client, configuredWorkspace } = await getHonchoClient();
    try {
      const discovery = await client.listAllWorkspaces();
      return NextResponse.json({
        items: discovery.items.map(({ id, created_at }) => ({ id, created_at })),
        total: discovery.items.length,
        page: 1,
        size: discovery.items.length || 1,
        pages: 1,
        truncated: discovery.truncated,
        configuredWorkspace,
        source: "available",
      });
    } catch (error) {
      if (!(error instanceof Error && /HTTP (401|403)/.test(error.message))) throw error;
      if (!configuredWorkspace) throw error;
      return NextResponse.json({
        items: [{ id: configuredWorkspace, created_at: null }],
        total: 1,
        page: 1,
        size: 1,
        pages: 1,
        configuredWorkspace,
        source: "configured",
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to list workspaces." },
      { status: 502 },
    );
  }
}
