import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HonchoDashboard } from "./honcho-dashboard";

const peers = ["hermes", "kevo"].map((id) => ({ id, workspace_id: "oasis", created_at: "2026-09-04T12:00:00Z", metadata: {}, configuration: {} }));

const memories = [1, 2, 3].map((index) => ({
  id: `c${index}`,
  content: `Fixture memory number ${index}`,
  observer_id: "hermes",
  observed_id: "kevo",
  session_id: null,
  level: "explicit",
  times_derived: null,
  created_at: "2026-09-04T12:00:00Z",
}));

const sessions = [1, 2].map((index) => ({ id: `session-${index}`, is_active: false, workspace_id: "oasis", metadata: {}, configuration: {}, created_at: "2026-09-20T00:00:00Z" }));

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

type Req = { url: string; method: string; body?: unknown };

function installFetch({ memoryTotal = 3 }: { memoryTotal?: number } = {}) {
  const requests: Req[] = [];
  let liveMemories = [...memories];
  let liveSessions = [...sessions];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ url, method, body });
    if (url === "/api/status") return json({ ok: true, baseUrl: "http://localhost:8000", isRemote: false, configuredWorkspace: "oasis", selectedWorkspace: "oasis", workspaces: [{ id: "oasis", created_at: null }] });
    if (url === "/api/oasis") {
      // Real requests take milliseconds; without latency React batches the null and loaded states together.
      await new Promise((resolve) => setTimeout(resolve, 20));
      return json({
        workspace: "oasis",
        peers: { items: peers, total: 2, page: 1, size: 100, pages: 1 },
        sessions: { items: liveSessions, total: liveSessions.length, page: 1, size: 50, pages: 1 },
        conclusions: { items: liveMemories, total: memoryTotal, page: 1, size: 20, pages: 1 },
        queue: { pending_work_units: 0, total_work_units: 0, completed_work_units: 0, in_progress_work_units: 0 },
      });
    }
    if (url.startsWith("/api/oasis/memories/ids")) return json({ ids: ["c1", "c2", "c3", "c4", "c5"], total: 5, truncated: false });
    if (url === "/api/oasis/memories/bulk-delete" && method === "POST") {
      const ids = (body as { ids: string[] }).ids;
      liveMemories = liveMemories.filter((item) => !ids.includes(item.id));
      return json({ deleted: ids, failed: [] });
    }
    if (url.startsWith("/api/oasis/memories")) {
      return json({ items: liveMemories, total: memoryTotal - (memories.length - liveMemories.length), page: 1, size: 30, pages: memoryTotal > 3 ? 2 : 1, mode: "recent" });
    }
    if (url.startsWith("/api/oasis/sessions/ids")) return json({ ids: liveSessions.map((session) => session.id), total: liveSessions.length, truncated: false });
    if (url === "/api/oasis/sessions/bulk-delete" && method === "POST") {
      const ids = (body as { ids: string[] }).ids;
      liveSessions = liveSessions.filter((session) => !ids.includes(session.id));
      return json({ deleted: ids, failed: [] });
    }
    if (/\/sessions\/[^/]+\/messages/.test(url)) return json({ items: [], total: 0, page: 1, size: 50, pages: 0 });
    if (/\/sessions\/[^/]+\/summaries/.test(url)) return json({ id: "session-1", short_summary: null, long_summary: null });
    if (/\/sessions\/[^/]+\/context/.test(url)) return json({ session_context: { id: "session-1", messages: [], summary: null, peer_representation: null, peer_card: null } });
    if (url.startsWith("/api/oasis/sessions")) {
      const contains = new URL(url, "http://localhost").searchParams.get("contains") ?? "";
      const items = liveSessions.filter((session) => session.id.includes(contains));
      return json({ items, total: items.length, page: 1, size: 50, pages: 1 });
    }
    if (/\/peers\/[^/]+\/card/.test(url) && method === "PUT") return json({ peer_card: [] });
    if (/\/peers\/[^/]+\/context/.test(url)) return json({ peer_id: "hermes", target_id: "hermes", representation: "", peer_card: [] });
    if (url.includes("/peers")) return json({ items: peers, total: 2, page: 1, size: 100, pages: 1 });
    if (url.includes("/stats")) return json({ error: "not needed" }, 502);
    if (url.includes("/journal")) return json({ items: [] });
    if (url.includes("/triage")) return json({ analyzed: 0, totalAvailable: 0, truncated: false, groups: [] });
    if (url.includes("/queue")) return json({ queue: { pending_work_units: 0, in_progress_work_units: 0, total_work_units: 0, completed_work_units: 0 } });
    if (url === "/api/oasis/webhooks") return json({ workspace: "oasis", webhooks: [{ id: "w1", workspace_id: "oasis", url: "http://127.0.0.1:9/hook", created_at: "2026-11-01T00:00:00Z" }], total: 1 });
    if (url === "/api/oasis/webhooks/w1" && method === "DELETE") return { ok: true, status: 204, json: async () => ({}) } as Response;
    return json({ error: `Unexpected request: ${method} ${url}` }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { requests };
}

async function openSection(name: RegExp) {
  render(<HonchoDashboard />);
  await waitFor(() => expect(screen.getAllByRole("button", { name: /Memories/ }).length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByRole("button", { name })[0]!);
}

describe("bulk management", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("header checkbox selects every loaded memory and goes indeterminate on partial selection", async () => {
    installFetch();
    await openSection(/Memories/);
    await screen.findByText("Fixture memory number 1");
    const master = screen.getAllByRole("checkbox", { name: "Select all loaded memories" })[0] as HTMLInputElement;
    fireEvent.click(master);
    for (const index of [1, 2, 3]) expect(screen.getByRole("checkbox", { name: `Select memory c${index}` })).toBeChecked();
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select memory c2" }));
    expect(master.indeterminate).toBe(true);
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("clicking a row checkbox does not open the editor", async () => {
    installFetch();
    await openSection(/Memories/);
    await screen.findByText("Fixture memory number 1");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select memory c1" }));
    expect(screen.queryByRole("dialog", { name: /Curate memory/ })).not.toBeInTheDocument();
  });

  it("bulk deletes selected memories only after the typed confirmation", async () => {
    const { requests } = installFetch();
    await openSection(/Memories/);
    await screen.findByText("Fixture memory number 1");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select memory c1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select memory c3" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected (2)" }));

    const dialog = await screen.findByRole("dialog", { name: /Delete 2 memories/ });
    const confirm = within(dialog).getByRole("button", { name: "Delete 2" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Type DELETE/ }), { target: { value: "DELETE" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(requests.some((request) => request.url === "/api/oasis/memories/bulk-delete")).toBe(true));
    const bulk = requests.find((request) => request.url === "/api/oasis/memories/bulk-delete");
    expect(bulk?.body).toEqual({ ids: ["c1", "c3"], confirm: true });
    await within(dialog).findByText(/Deleted 2 of 2/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByText("Fixture memory number 1")).not.toBeInTheDocument());
    expect(screen.getByText("Fixture memory number 2")).toBeInTheDocument();
  });

  it("cancelling the dialog sends no delete request", async () => {
    const { requests } = installFetch();
    await openSection(/Memories/);
    await screen.findByText("Fixture memory number 1");
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select all loaded memories" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Delete selected (3)" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(requests.some((request) => request.url.includes("bulk-delete"))).toBe(false);
  });

  it("text search sends a contains filter and select-all-matching pulls every matching id", async () => {
    const { requests } = installFetch({ memoryTotal: 5 });
    await openSection(/Memories/);
    await screen.findByText("Fixture memory number 1");
    const textFilter = screen.getByRole("textbox", { name: "Filter memories containing text" });
    fireEvent.change(textFilter, { target: { value: "nic.in" } });
    fireEvent.keyDown(textFilter, { key: "Enter" });
    await waitFor(() => expect(requests.some((request) => request.url.startsWith("/api/oasis/memories?") && request.url.includes("contains=nic.in"))).toBe(true));
    fireEvent.click(await screen.findByRole("button", { name: /Select all 5 matching/ }));
    await waitFor(() => expect(requests.some((request) => request.url.startsWith("/api/oasis/memories/ids?") && request.url.includes("contains=nic.in"))).toBe(true));
    expect(await screen.findByText("5 selected")).toBeInTheDocument();
  });

  it("keeps the text filter after a bulk delete refreshes the workspace", async () => {
    const { requests } = installFetch();
    await openSection(/Memories/);
    await screen.findByText("Fixture memory number 1");
    const textFilter = screen.getByRole("textbox", { name: "Filter memories containing text" });
    fireEvent.change(textFilter, { target: { value: "Fixture" } });
    fireEvent.keyDown(textFilter, { key: "Enter" });
    await waitFor(() => expect(requests.some((request) => request.url.includes("contains=Fixture"))).toBe(true));
    await screen.findByText("Fixture memory number 1");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select memory c1" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected (1)" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Type DELETE/ }), { target: { value: "DELETE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete 1" }));
    await within(dialog).findByText(/Deleted 1 of 1/);
    const before = requests.length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(requests.slice(before).some((request) => request.url === "/api/oasis")).toBe(true));
    // Let the workspace refresh settle; a remount would issue an unfiltered page-one request here.
    await new Promise((resolve) => setTimeout(resolve, 150));
    await waitFor(() => expect(screen.getByText("Fixture memory number 2")).toBeInTheDocument());
    expect(screen.queryByText("Fixture memory number 1")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Filter memories containing text" })).toHaveValue("Fixture");
    const memoryLists = requests.slice(before).filter((request) => request.url.startsWith("/api/oasis/memories?"));
    expect(memoryLists.length).toBeGreaterThan(0);
    expect(memoryLists.every((request) => request.url.includes("contains=Fixture"))).toBe(true);
  });

  it("selects and deletes sessions with the typed confirmation", async () => {
    const { requests } = installFetch();
    await openSection(/Sessions/);
    const master = await screen.findByRole("checkbox", { name: "Select all sessions on this page" });
    fireEvent.click(master);
    fireEvent.click(screen.getByRole("button", { name: "Delete selected (2)" }));
    const dialog = await screen.findByRole("dialog", { name: /Delete 2 sessions/ });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Type DELETE/ }), { target: { value: "DELETE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete 2" }));
    await within(dialog).findByText(/Deleted 2 of 2/);
    expect(requests.find((request) => request.url === "/api/oasis/sessions/bulk-delete")?.body).toEqual({ ids: ["session-1", "session-2"], confirm: true });
  });

  it("clears a detail selection hidden by the session search so its delete button cannot target it", async () => {
    installFetch();
    await openSection(/Sessions/);
    await screen.findByRole("button", { name: "Delete session" });
    const search = screen.getByRole("textbox", { name: "Search sessions by id" });
    fireEvent.change(search, { target: { value: "nomatch" } });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Delete session" })).not.toBeInTheDocument());
  });

  it("searches sessions by id", async () => {
    const { requests } = installFetch();
    await openSection(/Sessions/);
    const search = await screen.findByRole("textbox", { name: "Search sessions by id" });
    fireEvent.change(search, { target: { value: "2026" } });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(requests.some((request) => request.url.startsWith("/api/oasis/sessions?") && request.url.includes("contains=2026"))).toBe(true));
  });

  it("purges a peer's conclusions and cards after typing PURGE", async () => {
    const { requests } = installFetch();
    await openSection(/Peers/);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select peer kevo" }));
    fireEvent.click(screen.getByRole("button", { name: "Purge selected (1)" }));
    const dialog = await screen.findByRole("dialog", { name: /Purge memory for 1 peer/ });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Type PURGE/ }), { target: { value: "PURGE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Purge 1" }));
    await within(dialog).findByText(/Deleted 5 of 5/);
    const idQueries = requests.filter((request) => request.url.startsWith("/api/oasis/memories/ids?"));
    expect(idQueries.some((request) => request.url.includes("observer_id=kevo"))).toBe(true);
    expect(idQueries.some((request) => request.url.includes("observed_id=kevo"))).toBe(true);
    const cardWrites = requests.filter((request) => request.method === "PUT" && request.url.includes("/card"));
    expect(cardWrites.map((request) => request.url)).toEqual(expect.arrayContaining(["/api/oasis/peers/kevo/card", "/api/oasis/peers/hermes/card?target=kevo"]));
    expect(cardWrites.every((request) => JSON.stringify(request.body) === JSON.stringify({ facts: [] }))).toBe(true);
  });

  it("deletes selected webhooks after confirmation", async () => {
    const { requests } = installFetch();
    await openSection(/Webhooks/);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select all webhooks" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected (1)" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Type DELETE/ }), { target: { value: "DELETE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete 1" }));
    await within(dialog).findByText(/Deleted 1 of 1/);
    expect(requests.some((request) => request.url === "/api/oasis/webhooks/w1" && request.method === "DELETE")).toBe(true);
  });
});
