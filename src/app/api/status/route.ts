import { NextResponse } from "next/server";

import { getHonchoClient } from "@/lib/server";

export async function GET() {
  try {
    const { client, configuredWorkspace, baseUrl, isRemote } = await getHonchoClient();
    let workspaces: Awaited<ReturnType<typeof client.listAllWorkspaces>> | null = null;
    let workspaceItems: Awaited<ReturnType<typeof client.listAllWorkspaces>>["items"] = [];
    try {
      workspaces = await client.listAllWorkspaces();
      workspaceItems = workspaces.items;
    } catch (error) {
      // Workspace listing is admin-scoped in Honcho. A normal workspace token
      // can still use its configured workspace, so validate that default before
      // advertising a usable connection.
      if (!(error instanceof Error && /HTTP (401|403)/.test(error.message))) {
        throw error;
      }
      if (!configuredWorkspace) {
        return NextResponse.json({
          ok: false,
          baseUrl,
          isRemote,
          configuredWorkspace: null,
          selectedWorkspace: null,
          workspaces: [],
          workspaceListing: "unauthorized",
          error: "Workspace discovery is unauthorized and no configured workspace is available.",
        });
      }
      try {
        await client.listPeers(configuredWorkspace, 1, 1);
      } catch (validationError) {
        const detail = validationError instanceof Error ? validationError.message : "";
        return NextResponse.json({
          ok: false,
          baseUrl,
          isRemote,
          configuredWorkspace,
          selectedWorkspace: configuredWorkspace,
          workspaces: [],
          workspaceListing: "unavailable",
          error: /HTTP (401|403)/.test(detail)
            ? "Workspace discovery is unauthorized and the configured workspace could not be validated."
            : "The configured workspace is unavailable.",
        });
      }
    }
    const selectedWorkspace = configuredWorkspace ?? workspaceItems[0]?.id ?? null;

    return NextResponse.json({
      ok: true,
      baseUrl,
      isRemote,
      configuredWorkspace,
      selectedWorkspace,
      workspaces: workspaceItems.length ? workspaceItems.map(({ id, created_at }) => ({ id, created_at })) : (configuredWorkspace ? [{ id: configuredWorkspace, created_at: null }] : []),
      workspaceListing: workspaces ? (workspaces.truncated ? "truncated" : "available") : "configured",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to connect to Honcho.",
      },
      { status: 503 },
    );
  }
}
