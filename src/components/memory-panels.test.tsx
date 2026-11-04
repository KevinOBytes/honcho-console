import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GrowthChart, ScopesView, SessionContextPanel, TriagePanel, WebhooksView } from "./memory-panels";

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
let confirmMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  confirmMock = vi.fn(() => true);
  vi.stubGlobal("confirm", confirmMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function handleWith(routes: Record<string, (url: string, init?: RequestInit) => Response>) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const normalized = url.split("?")[0];
    const handler = routes[normalized];
    if (!handler) throw new Error(`Unhandled fetch: ${url}`);
    return Promise.resolve(handler(url, init));
  });
}

describe("SessionContextPanel", () => {
  it("renders the summary, representation, and card facts", async () => {
    handleWith({
      "/api/oasis/sessions/s1/context": () => jsonResponse({
        session_context: {
          id: "s1",
          messages: [{ content: "hello" }, { content: "world" }],
          summary: { content: "Short summary text", message_id: "m1", summary_type: "short", created_at: "2026-09-04T12:00:00Z", token_count: 7 },
          peer_representation: "Kevin prefers direct prose.",
          peer_card: ["IDENTITY: Name: Kevin", "ATTRIBUTE: Location: Virginia"],
        },
      }),
    });

    render(<SessionContextPanel workspace="oasis" sessionId="s1" />);

    await screen.findByText("Short summary text");
    expect(screen.getByText("Kevin prefers direct prose.")).toBeTruthy();
    expect(screen.getByText("IDENTITY: Name: Kevin")).toBeTruthy();
    expect(screen.getByText(/2 messages included/)).toBeTruthy();
  });

  it("shows an explicit empty state when no context exists", async () => {
    handleWith({
      "/api/oasis/sessions/s1/context": () => jsonResponse({ session_context: { id: "s1", messages: [], summary: null, peer_representation: null, peer_card: null } }),
    });

    render(<SessionContextPanel workspace="oasis" sessionId="s1" />);

    await screen.findByText("No context assembled for this session yet.");
  });
});

describe("TriagePanel", () => {
  const triagePayload = {
    analyzed: 2,
    totalAvailable: 2,
    truncated: false,
    groups: [{
      observer_id: "hermes",
      observed_id: "kevo",
      maxSimilarity: 0.95,
      members: [
        { id: "c1", level: "explicit", times_derived: 2, created_at: "2026-09-01T00:00:00Z", content: "Kevin prefers direct prose." },
        { id: "c2", level: "explicit", times_derived: 1, created_at: "2026-09-02T00:00:00Z", content: "Kevin prefers direct, practical prose." },
      ],
    }],
  };

  it("renders duplicate groups and deletes a member after confirmation", async () => {
    let triageCalls = 0;
    handleWith({
      "/api/oasis/triage": () => jsonResponse(triagePayload),
      "/api/oasis/memories/c2": () => {
        triagePayload.groups[0].members = triagePayload.groups[0].members.filter((member) => member.id !== "c2");
        triageCalls += 1;
        return jsonResponse({ ok: true });
      },
    });

    render(<TriagePanel workspace="oasis" />);

    await screen.findByText("95% similar");
    const deleteButtons = screen.getAllByText("Delete");
    fireEvent.click(deleteButtons[1]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/oasis/memories/c2", expect.objectContaining({ method: "DELETE" })));
    expect(confirmMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(triageCalls).toBe(1));
  });

  it("shows an empty state when no duplicates are found", async () => {
    handleWith({
      "/api/oasis/triage": () => jsonResponse({ analyzed: 1, totalAvailable: 1, truncated: false, groups: [] }),
    });

    render(<TriagePanel workspace="oasis" />);

    await screen.findByText("No near-duplicate groups found in the scanned window.");
  });
});

describe("GrowthChart", () => {
  it("renders stacked bars, a legend, and observer totals", () => {
    const dailyByLevel = Array.from({ length: 3 }, (_unused, index) => ({
      date: `2026-10-${String(index + 1).padStart(2, "0")}`,
      levels: { explicit: index + 1, deductive: index, inductive: 0, contradiction: 0 },
    }));
    const dailyByObserver = [{ date: "2026-10-01", observers: { hermes: 1, kevo: 0 } }];

    render(<GrowthChart dailyByLevel={dailyByLevel} dailyByObserver={dailyByObserver} />);

    expect(screen.getByRole("img", { name: /stacked bar chart/i })).toBeTruthy();
    expect(screen.getByText("explicit")).toBeTruthy();
    expect(screen.getByText("deductive")).toBeTruthy();
    expect(screen.getByText(/hermes.*1/)).toBeTruthy();
  });
});

describe("ScopesView", () => {
  it("lists scopes and shows membership for a selected scope", async () => {
    handleWith({
      "/api/oasis/scopes": () => jsonResponse({
        scopes: [{ id: "support", created_at: "2026-09-05T12:00:00Z", session_count: 1 }],
        total: 1,
        truncated: false,
      }),
      "/api/oasis/scopes/support": () => jsonResponse({
        scope: { id: "support", created_at: "2026-09-05T12:00:00Z", session_count: 1 },
        sessions: [{ id: "session-9", is_active: true, created_at: "2026-09-04T12:00:00Z" }],
        session_total: 1,
        status: { backfill_status: { "session-9": { state: "completed", docs_copied: 5 } } },
      }),
    });

    render(<ScopesView workspace="oasis" />);

    await screen.findByText("support");
    fireEvent.click(screen.getByText("support"));
    await screen.findByText("session-9");
    expect(screen.getByText(/completed/)).toBeTruthy();
  });
});

describe("WebhooksView", () => {
  it("lists configured endpoints and renders an empty state", async () => {
    handleWith({
      "/api/oasis/webhooks": () => jsonResponse({
        webhooks: [{ id: "wh-1", workspace_id: "oasis", url: "https://example.invalid/hook", created_at: "2026-09-05T12:00:00Z" }],
        total: 1,
      }),
    });

    const { unmount } = render(<WebhooksView workspace="oasis" />);
    await screen.findByText("https://example.invalid/hook");
    unmount();

    fetchMock.mockReset();
    handleWith({
      "/api/oasis/webhooks": () => jsonResponse({ webhooks: [], total: 0 }),
    });
    render(<WebhooksView workspace="oasis" />);
    await screen.findByText(/no webhook endpoints are configured/i);
  });
});