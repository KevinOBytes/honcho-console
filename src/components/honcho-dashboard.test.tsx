import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HonchoDashboard } from "./honcho-dashboard";

const peers = [
  {
    id: "hermes",
    workspace_id: "oasis",
    created_at: "2026-09-04T12:00:00Z",
    metadata: {},
    configuration: {},
  },
  {
    id: "kevo",
    workspace_id: "oasis",
    created_at: "2026-09-04T12:00:00Z",
    metadata: {},
    configuration: {},
  },
];

const memory = {
  id: "conclusion-1",
  content: "Kevin prefers local models.",
  observer_id: "hermes",
  observed_id: "kevo",
  session_id: null,
  level: "explicit",
  created_at: "2026-09-04T12:00:00Z",
};

const workspacePayload = (workspace: string) => ({
  workspace,
  peers: { items: peers.map((peer) => ({ ...peer, workspace_id: workspace })), total: 2, page: 1, size: 100, pages: 1 },
  sessions: { items: [], total: 0, page: 1, size: 50, pages: 0 },
  conclusions: { items: [memory], total: 1, page: 1, size: 20, pages: 1 },
  queue: { pending_work_units: 0, total_work_units: 0, completed_work_units: 0, in_progress_work_units: 0 },
});

const memoryPage = {
  items: [memory],
  total: 1,
  page: 1,
  size: 30,
  pages: 1,
};

function response(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

function installFetch() {
  const requests: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    if (url === "/api/status") {
      return response({
        ok: true,
        baseUrl: "http://localhost:8000",
        isRemote: false,
        configuredWorkspace: "oasis",
        selectedWorkspace: "oasis",
        workspaces: [
          { id: "oasis", created_at: null },
          { id: "other", created_at: null },
        ],
      });
    }
    if (url === "/api/oasis" || url === "/api/other") {
      return response(workspacePayload(url.endsWith("other") ? "other" : "oasis"));
    }
    if (url.includes("/peers") && (url.startsWith("/api/oasis") || url.startsWith("/api/other"))) {
      return response({ items: peers, total: peers.length, page: 1, size: 100, pages: 1 });
    }
    if (url.startsWith("/api/oasis/memories") || url.startsWith("/api/other/memories")) {
      return response(memoryPage);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requests };
}

describe("HonchoDashboard semantic memory search", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts relationship identifiers outside the initial peer page for semantic search", async () => {
    const { requests } = installFetch();
    render(<HonchoDashboard />);

    await waitFor(() => expect(screen.getByRole("button", { name: /Memories/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Memories/ }));

    const searchInput = await screen.findByRole("textbox", { name: "Search memory" });
    fireEvent.change(searchInput, { target: { value: "science" } });
    const observerSelect = screen.getByRole("combobox", { name: "Semantic search observer" });
    const observedSelect = screen.getByRole("combobox", { name: "Semantic search observed peer" });
    const addPeerOption = (select: HTMLElement, value: string) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    };
    addPeerOption(observerSelect, "peer-501");
    addPeerOption(observedSelect, "peer-502");
    fireEvent.change(observerSelect, { target: { value: "peer-501" } });
    fireEvent.change(observedSelect, { target: { value: "peer-502" } });

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      expect(requests.some((request) => request.startsWith("/api/oasis/memories?")
      && request.includes("query=science")
      && request.includes("observer_id=peer-501")
      && request.includes("observed_id=peer-502"))).toBe(true);
    });
  });

  it("remounts the memory view when the workspace changes", async () => {
    installFetch();
    render(<HonchoDashboard />);

    await waitFor(() => expect(screen.getAllByRole("button", { name: /Memories/ }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button", { name: /Memories/ })[0]);
    const searchInput = await screen.findByRole("textbox", { name: "Search memory" });
    fireEvent.change(searchInput, { target: { value: "science" } });
    expect(searchInput).toHaveValue("science");

    fireEvent.change(screen.getAllByRole("combobox", { name: "Workspace identifier" })[0], { target: { value: "other" } });
    await waitFor(() => expect(screen.getByText("ACTIVE WORKSPACE")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /Memories/ })[0]);

    const remountedSearchInput = await screen.findByRole("textbox", { name: "Search memory" });
    expect(remountedSearchInput).toHaveValue("");
  });
});
