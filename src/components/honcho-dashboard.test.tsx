import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HonchoDashboard, parseSectionParam } from "./honcho-dashboard";

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

const workspacePayload = (workspace: string, initialMemoryTotal = 1) => ({
  workspace,
  peers: { items: peers.map((peer) => ({ ...peer, workspace_id: workspace })), total: 2, page: 1, size: 100, pages: 1 },
  sessions: { items: [{ id: "session-1", is_active: true, workspace_id: workspace, metadata: {}, configuration: {}, created_at: "2026-09-20T00:00:00Z" }], total: 1, page: 1, size: 50, pages: 1 },
  conclusions: { items: [memory], total: initialMemoryTotal, page: 1, size: 20, pages: Math.ceil(initialMemoryTotal / 20) },
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

function installFetch(memoryPages: Record<number, typeof memoryPage> = {}, onMemoryPage?: (page: number, url: string) => Promise<typeof memoryPage> | null, initialMemoryTotal = 1) {
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
      return response(workspacePayload(url.endsWith("other") ? "other" : "oasis", initialMemoryTotal));
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
      const params = new URL(url, "http://localhost").searchParams;
      const page = Number(params.get("page") ?? 1);
      const custom = onMemoryPage?.(page, url);
      if (custom) return response(await custom);
      if (params.has("query")) return response({ ...memoryPage, items: [{ ...memory, id: "semantic-result", content: "Semantic result" }], mode: "semantic" });
      return response(memoryPages[page] ?? memoryPage);
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

describe("HonchoDashboard progressive memory browsing", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const pages = Object.fromEntries([1, 2, 3].map((page) => [page, {
    items: [{ ...memory, id: `conclusion-${page}`, content: `Memory ${page}` }],
    total: 3,
    page,
    size: 1,
    pages: 3,
  }]));

  it("appends the next page instead of replacing previously visible memories", async () => {
    const { requests } = installFetch(pages);
    await openSection(/Memories/);
    await screen.findByText("Memory 1");

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Memory 2");
    expect(screen.getByText("Memory 1")).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 loaded/)).toBeInTheDocument();
    expect(requests.filter(({ url }) => url.includes("/memories?") && url.includes("page=2"))).toHaveLength(1);
  });

  it("loads every remaining page only after the explicit Load all action", async () => {
    const { requests } = installFetch(pages);
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    expect(requests.some(({ url }) => url.includes("/memories?") && url.includes("page=2"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Load all" }));
    await screen.findByText("Memory 3");
    expect(screen.getByText("Memory 1")).toBeInTheDocument();
    expect(screen.getByText("Memory 2")).toBeInTheDocument();
    expect(screen.getByText(/3 of 3 loaded/)).toBeInTheDocument();
    expect(requests.filter(({ url }) => url.includes("/memories?") && url.includes("page=2"))).toHaveLength(1);
    expect(requests.filter(({ url }) => url.includes("/memories?") && url.includes("page=3"))).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Load all" })).not.toBeInTheDocument();
  });

  it("loads another page when the end of the visible list enters the viewport", async () => {
    let onIntersect: IntersectionObserverCallback | null = null;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { onIntersect = callback; }
      observe() {}
      disconnect() {}
    });
    const { requests } = installFetch(pages);
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    await waitFor(() => expect(onIntersect).not.toBeNull());

    act(() => onIntersect!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    await screen.findByText("Memory 2");
    expect(screen.getByText("Memory 1")).toBeInTheDocument();
    expect(requests.filter(({ url }) => url.includes("/memories?") && url.includes("page=2"))).toHaveLength(1);
  });

  it("stops an in-flight full load without appending late results or fetching the next page", async () => {
    let finishSecondPage!: (page: typeof memoryPage) => void;
    const pending = new Promise<typeof memoryPage>((resolve) => { finishSecondPage = resolve; });
    const { requests } = installFetch(pages, (page) => page === 2 ? pending : null);
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    fireEvent.click(screen.getByRole("button", { name: "Load all" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Stop loading" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Stop loading" }));
    await act(async () => { finishSecondPage(pages[2]); await pending; });
    expect(screen.getByText("Memory 1")).toBeInTheDocument();
    expect(screen.queryByText("Memory 2")).not.toBeInTheDocument();
    expect(requests.some(({ url }) => url.includes("/memories?") && url.includes("page=3"))).toBe(false);
  });

  it("does not restart automatic fetching after Stop while the sentinel remains visible", async () => {
    const callbacks: IntersectionObserverCallback[] = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { callbacks.push(callback); }
      observe() {}
      disconnect() {}
    });
    let finishSecondPage!: (page: typeof memoryPage) => void;
    const pending = new Promise<typeof memoryPage>((resolve) => { finishSecondPage = resolve; });
    const { requests } = installFetch(pages, (page) => page === 2 ? pending : null);
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    await waitFor(() => expect(callbacks.length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Load all" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop loading" }));
    await act(async () => { finishSecondPage(pages[2]); await pending; });
    act(() => callbacks.at(-1)!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(requests.filter(({ url }) => url.includes("/memories?") && url.includes("page=2"))).toHaveLength(1);
  });

  it("resets accumulated memories when the level filter changes", async () => {
    installFetch(pages);
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Memory 2");
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by memory level" }), { target: { value: "deductive" } });
    await waitFor(() => expect(screen.queryByText("Memory 2")).not.toBeInTheDocument());
    expect(screen.getByText("Memory 1")).toBeInTheDocument();
  });

  it("cancels a full load when the user switches to a semantic query", async () => {
    let finishSecondPage!: (page: typeof memoryPage) => void;
    const pending = new Promise<typeof memoryPage>((resolve) => { finishSecondPage = resolve; });
    const { requests } = installFetch(pages, (page) => page === 2 ? pending : null);
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    fireEvent.click(screen.getByRole("button", { name: "Load all" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Stop loading" })).toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox", { name: "Search memory" }), { target: { value: "science" } });
    await act(async () => { finishSecondPage(pages[2]); await pending; });
    expect(screen.queryByText("Memory 2")).not.toBeInTheDocument();
    expect(requests.some(({ url }) => url.includes("/memories?") && url.includes("page=3"))).toBe(false);
  });

  it("retries the first page after an initial load failure", async () => {
    let attempts = 0;
    const { requests } = installFetch(pages, (page) => {
      if (page !== 1 || ++attempts > 1) return null;
      return Promise.reject(new Error("Temporarily unavailable"));
    }, 90);
    await openSection(/Memories/);
    await screen.findByText("Temporarily unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Memory 1");
    expect(requests.filter(({ url }) => url.includes("/memories?") && url.includes("page=1"))).toHaveLength(2);
  });

  it("keeps earlier pages visible when loading another page fails, then retries", async () => {
    let attempts = 0;
    installFetch(pages, (page) => {
      if (page !== 2 || ++attempts > 1) return null;
      return Promise.reject(new Error("Next page unavailable"));
    });
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Next page unavailable");
    expect(screen.getByText("Memory 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Memory 2");
    expect(screen.getByText("Memory 1")).toBeInTheDocument();
  });

  it("retries page one after a filter reset fails, rather than appending the old list", async () => {
    let attempts = 0;
    const filtered = { ...pages[1], items: [{ ...memory, id: "filtered", content: "Filtered memory" }], total: 1, pages: 1 };
    const { requests } = installFetch(pages, (page, url) => {
      if (page !== 1 || !url.includes("level=deductive")) return null;
      return ++attempts === 1 ? Promise.reject(new Error("Filter temporarily unavailable")) : Promise.resolve(filtered);
    });
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Memory 2");
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by memory level" }), { target: { value: "deductive" } });
    await screen.findByText("Filter temporarily unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Filtered memory");
    expect(screen.queryByText("Memory 2")).not.toBeInTheDocument();
    expect(requests.filter(({ url }) => url.includes("level=deductive") && url.includes("page=1"))).toHaveLength(2);
    expect(requests.some(({ url }) => url.includes("level=deductive") && url.includes("page=3"))).toBe(false);
  });

  it("does not append an incompatible page after a browse-filter reset fails", async () => {
    const { requests } = installFetch(pages, (page, url) => page === 1 && url.includes("level=deductive") ? Promise.reject(new Error("Filter failed")) : null);
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Memory 2");
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by memory level" }), { target: { value: "deductive" } });
    await screen.findByText("Filter failed");
    const appendButton = screen.queryByRole("button", { name: "Load more" });
    if (appendButton) fireEvent.click(appendButton);
    expect(requests.some(({ url }) => url.includes("level=deductive") && url.includes("page=3"))).toBe(false);
  });

  it("discards a pending semantic result when the query is cleared", async () => {
    let finishSemantic!: (page: typeof memoryPage) => void;
    const pending = new Promise<typeof memoryPage>((resolve) => { finishSemantic = resolve; });
    const { requests } = installFetch(pages, (_page, url) => url.includes("query=science") ? pending : null);
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    const queryInput = screen.getByRole("textbox", { name: "Search memory" });
    fireEvent.change(queryInput, { target: { value: "science" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(requests.some(({ url }) => url.includes("query=science"))).toBe(true));
    fireEvent.change(queryInput, { target: { value: "" } });
    await act(async () => { finishSemantic({ ...memoryPage, items: [{ ...memory, id: "semantic-result", content: "Semantic result" }] }); await pending; });
    expect(screen.queryByText("Semantic result")).not.toBeInTheDocument();
    expect(screen.getByText("Memory 1")).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 loaded/)).toBeInTheDocument();
    expect(requests.filter(({ url }) => url.includes("/memories?") && url.includes("page=1") && !url.includes("query="))).toHaveLength(2);
  });

  it("discards a pending semantic result when its peer scope changes", async () => {
    let finishSemantic!: (page: typeof memoryPage) => void;
    const pending = new Promise<typeof memoryPage>((resolve) => { finishSemantic = resolve; });
    const { requests } = installFetch(pages, (_page, url) => url.includes("query=science") ? pending : null);
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    fireEvent.change(screen.getByRole("textbox", { name: "Search memory" }), { target: { value: "science" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(requests.some(({ url }) => url.includes("query=science"))).toBe(true));
    fireEvent.change(screen.getByRole("combobox", { name: "Semantic search observed peer" }), { target: { value: "hermes" } });
    await act(async () => { finishSemantic({ ...memoryPage, items: [{ ...memory, id: "semantic-result", content: "Semantic result" }] }); await pending; });
    expect(screen.queryByText("Semantic result")).not.toBeInTheDocument();
  });

  it("returns to chronological browsing when a completed semantic query is cleared", async () => {
    const { requests } = installFetch(pages);
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    const queryInput = screen.getByRole("textbox", { name: "Search memory" });
    fireEvent.change(queryInput, { target: { value: "science" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Semantic result");
    fireEvent.change(queryInput, { target: { value: "" } });
    await waitFor(() => expect(screen.queryByText("Semantic result")).not.toBeInTheDocument());
    expect(screen.getByText("Memory 1")).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 loaded/)).toBeInTheDocument();
    expect(requests.filter(({ url }) => url.includes("/memories?") && url.includes("page=1") && !url.includes("query="))).toHaveLength(2);
  });

  it("ignores a queued scroll callback after the semantic query draft changes", async () => {
    const callbacks: IntersectionObserverCallback[] = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { callbacks.push(callback); }
      observe() {}
      disconnect() {}
    });
    const { requests } = installFetch(pages);
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    await waitFor(() => expect(callbacks.length).toBeGreaterThan(0));
    const stale = callbacks.at(-1)!;
    fireEvent.change(screen.getByRole("textbox", { name: "Search memory" }), { target: { value: "science" } });
    act(() => stale([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(requests.some(({ url }) => url.includes("/memories?") && url.includes("page=2"))).toBe(false);
  });

  it("ignores an old intersection callback after a filter reset begins", async () => {
    const callbacks: IntersectionObserverCallback[] = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { callbacks.push(callback); }
      observe() {}
      disconnect() {}
    });
    let finishFiltered!: (page: typeof memoryPage) => void;
    const pending = new Promise<typeof memoryPage>((resolve) => { finishFiltered = resolve; });
    const filtered = { ...pages[1], items: [{ ...memory, id: "filtered", content: "Filtered memory" }], total: 1, pages: 1 };
    const { requests } = installFetch(pages, (page, url) => page === 1 && url.includes("level=deductive") ? pending : null);
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    await waitFor(() => expect(callbacks.length).toBeGreaterThan(0));
    const stale = callbacks.at(-1)!;
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by memory level" }), { target: { value: "deductive" } });
    act(() => stale([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    await act(async () => { finishFiltered(filtered); await pending; });
    expect(await screen.findByText("Filtered memory")).toBeInTheDocument();
    expect(requests.some(({ url }) => url.includes("/memories?") && url.includes("page=2") && !url.includes("level=deductive"))).toBe(false);
  });

  it("counts only unique IDs when the first or an appended page contains duplicates", async () => {
    const duplicateFirst = { ...pages[1], items: [pages[1].items[0], pages[1].items[0]], total: 3, pages: 2 };
    const duplicateSecond = { ...pages[2], items: [pages[2].items[0], pages[2].items[0]], total: 3, pages: 2 };
    installFetch({ 1: duplicateFirst, 2: duplicateSecond });
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    expect(screen.getAllByText("Memory 1")).toHaveLength(1);
    expect(screen.getByText(/1 of 3 loaded/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Memory 2");
    expect(screen.getAllByText("Memory 2")).toHaveLength(1);
    expect(screen.getByText(/2 of 3 loaded/)).toBeInTheDocument();
  });

  it("does not show a repeated conclusion twice when pages overlap", async () => {
    const overlapping = { ...pages, 2: { ...pages[2], items: [pages[1].items[0], pages[2].items[0]] } };
    installFetch(overlapping);
    await openSection(/Memories/);
    await screen.findByText("Memory 1");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Memory 2");
    expect(screen.getAllByText("Memory 1")).toHaveLength(1);
    expect(screen.getByText(/2 of 3 loaded/)).toBeInTheDocument();
  });
});

describe("parseSectionParam", () => {
  it("accepts every known section id", () => {
    for (const id of ["overview", "memories", "peers", "sessions", "search", "scopes", "webhooks"]) {
      expect(parseSectionParam(id)).toBe(id);
    }
  });

  it("falls back to overview for unknown or missing values", () => {
    expect(parseSectionParam("bogus")).toBe("overview");
    expect(parseSectionParam(null)).toBe("overview");
    expect(parseSectionParam("SCOPES")).toBe("overview");
    expect(parseSectionParam("")).toBe("overview");
  });
});
