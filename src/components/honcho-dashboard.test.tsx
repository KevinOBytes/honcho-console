import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  sessions: { items: [{ id: "session-1", is_active: true, workspace_id: workspace, metadata: {}, configuration: {}, created_at: "2026-09-20T00:00:00Z" }], total: 1, page: 1, size: 50, pages: 1 },
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

const journalEntries = [
  {
    at: "2026-09-20T12:00:00.000Z",
    action: "replace",
    workspace: "oasis",
    summary: "Replaced conclusion conclusion-1 with conclusion-2",
    id: "conclusion-2",
  },
];

const statsPayload = {
  analyzed: 1,
  totalAvailable: 1,
  truncated: false,
  byLevel: [
    { level: "explicit", count: 1 },
    { level: "deductive", count: 0 },
    { level: "inductive", count: 0 },
    { level: "contradiction", count: 0 },
  ],
  topObservers: [{ id: "hermes", count: 1 }],
  topObserved: [{ id: "kevo", count: 1 }],
  topSessions: [],
  oldest: "2026-09-04T12:00:00Z",
  newest: "2026-09-04T12:00:00Z",
  daily: Array.from({ length: 30 }, (_, index) => ({ date: `2026-08-2${index % 10}`, count: index === 29 ? 1 : 0 })),
};

function response(body: unknown, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    ...extra,
  };
}

function installFetch() {
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown;
    try {
      body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    } catch {
      body = undefined;
    }
    requests.push({ url, method, body });
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
    if (method === "POST" && /\/peers\/[^/]+\/chat$/.test(url)) {
      return response({ content: "Answer from memory." });
    }
    if (method === "POST" && /\/peers\/[^/]+\/representation$/.test(url)) {
      return response({ representation: "Scoped representation for the query." });
    }
    if (method === "POST" && /\/peers\/[^/]+\/search$/.test(url)) {
      return response({ items: [] });
    }
    if (method === "POST" && /\/dreams$/.test(url)) {
      return response({ ok: true, queue: { pending_work_units: 2, in_progress_work_units: 0, total_work_units: 10, completed_work_units: 8 } });
    }
    if (method === "POST" && /\/search$/.test(url)) {
      return response({ items: [], mode: "message-search" });
    }
    if (/\/peers\/[^/]+\/context/.test(url)) {
      return response({ peer_id: "hermes", target_id: "hermes", representation: "The user prefers local models.", peer_card: ["Runs local models"] });
    }
    if (url.includes("/peers")) {
      return response({ items: peers, total: peers.length, page: 1, size: 100, pages: 1 });
    }
    if (url.startsWith("/api/oasis/memories") || url.startsWith("/api/other/memories")) {
      return response(memoryPage);
    }
    if (/\/sessions\/[^/]+\/summaries$/.test(url)) {
      return response({
        id: "session-1",
        short_summary: { content: "Short recap of the session.", message_id: "m1", summary_type: "short", created_at: "2026-09-20T00:00:00Z", token_count: 9 },
        long_summary: null,
      });
    }
    if (/\/sessions\/[^/]+\/messages/.test(url)) {
      return response({ items: [], total: 0, page: 1, size: 50, pages: 0 });
    }
    if (/\/stats$/.test(url)) {
      return response({ stats: statsPayload, queue: { pending_work_units: 0, in_progress_work_units: 0, total_work_units: 0, completed_work_units: 0 } });
    }
    if (url.includes("/journal")) {
      return response({ items: journalEntries });
    }
    if (url.includes("/export")) {
      const headers = { get: (name: string) => (name === "content-disposition" ? 'attachment; filename="honcho-oasis-export.json"' : null) };
      return {
        ok: true,
        status: 200,
        blob: async () => new Blob(["{}"], { type: "application/json" }),
        headers,
      };
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requests };
}

describe("HonchoDashboard semantic memory search", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
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
      expect(requests.some((request) => request.url.startsWith("/api/oasis/memories?")
      && request.url.includes("query=science")
      && request.url.includes("observer_id=peer-501")
      && request.url.includes("observed_id=peer-502"))).toBe(true);
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

async function openSection(name: string | RegExp) {
  render(<HonchoDashboard />);
  await waitFor(() => expect(screen.getAllByRole("button", { name: /Memories/ }).length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByRole("button", { name })[0]);
}

describe("HonchoDashboard feature additions", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks a peer through the dialectic panel and renders the answer", async () => {
    const { requests } = installFetch();
    await openSection(/Peers/);

    const chatInput = await screen.findByRole("textbox", { name: "Question for this peer" });
    fireEvent.change(chatInput, { target: { value: "What does kevo prefer?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    await waitFor(() => expect(screen.getByText("Answer from memory.")).toBeInTheDocument());
    const chatRequest = requests.find((request) => request.method === "POST" && request.url.endsWith("/peers/hermes/chat"));
    expect(chatRequest?.body).toMatchObject({ query: "What does kevo prefer?", reasoning_level: "low" });
  });

  it("shows an original-versus-replacement preview in the memory editor", async () => {
    installFetch();
    render(<HonchoDashboard />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Memories/ }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button", { name: /Memories/ })[0]);

    const row = await screen.findByRole("button", { name: /Open memory: Kevin prefers local models/ });
    fireEvent.click(row);

    expect(await screen.findByText("Original")).toBeInTheDocument();
    expect(screen.getByText("Replacement")).toBeInTheDocument();
    const diffPanel = screen.getByLabelText("Replacement preview");
    expect(diffPanel).toBeInTheDocument();
  });

  it("schedules a dream only after confirmation and shows the queue", async () => {
    const { requests } = installFetch();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    await openSection(/Peers/);

    const dreamButton = await screen.findByRole("button", { name: "Schedule dream" });
    fireEvent.click(dreamButton);
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(requests.some((request) => request.url.endsWith("/dreams"))).toBe(false);

    confirmSpy.mockReturnValue(true);
    fireEvent.click(dreamButton);
    await waitFor(() => expect(screen.getByText(/pending 2/)).toBeInTheDocument());
    expect(requests.some((request) => request.method === "POST" && request.url.endsWith("/dreams"))).toBe(true);
  });

  it("downloads an export through the overview panel", async () => {
    const { requests } = installFetch();
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    render(<HonchoDashboard />);
    const exportButton = await screen.findByRole("button", { name: "Export JSON" });
    fireEvent.click(exportButton);

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(requests.some((request) => request.url.endsWith("/export?format=json"))).toBe(true);
  });

  it("renders the composition and journal panels on the overview", async () => {
    installFetch();
    render(<HonchoDashboard />);

    expect(await screen.findByText("Memory composition")).toBeInTheDocument();
    expect(screen.getByText("Recent changes")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Replaced conclusion conclusion-1/)).toBeInTheDocument());
    expect(screen.getByRole("img", { name: "Conclusions per day over the last 30 days" })).toBeInTheDocument();
  });

  it("renders session summaries for the selected session", async () => {
    installFetch();
    render(<HonchoDashboard />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Sessions/ }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button", { name: /Sessions/ })[0]);

    await waitFor(() => expect(screen.getByText(/Short recap of the session/)).toBeInTheDocument());
  });
});
