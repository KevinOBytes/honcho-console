/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { GET } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

const conclusion = {
  id: "c1",
  content: "Kevin prefers local models.",
  observer_id: "hermes",
  observed_id: "kevo",
  session_id: "session-9",
  level: "explicit",
  created_at: "2026-09-10T12:00:00Z",
};

describe("GET /api/[workspace]/export", () => {
  let client: {
    listConclusions: ReturnType<typeof vi.fn>;
    listPeers: ReturnType<typeof vi.fn>;
    getPeerContext: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    client = {
      listConclusions: vi.fn().mockResolvedValue({ items: [conclusion], total: 1, page: 1, size: 100, pages: 1 }),
      listPeers: vi.fn().mockResolvedValue({
        items: [
          { id: "hermes", workspace_id: "oasis", created_at: "2026-09-04T12:00:00Z", metadata: {}, configuration: {} },
          { id: "kevo", workspace_id: "oasis", created_at: "2026-09-04T12:00:00Z", metadata: {}, configuration: {} },
        ],
        total: 2,
        page: 1,
        size: 100,
        pages: 1,
      }),
      getPeerContext: vi.fn().mockImplementation(async (_workspace: string, peerId: string) => ({
        peer_id: peerId,
        target_id: peerId,
        representation: "rep",
        peer_card: peerId === "hermes" ? ["Runs local models"] : [],
      })),
    };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("exports JSON with peer cards and conclusions", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/export?format=json"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("content-disposition")).toContain(".json");
    const payload = (await response.json()) as { workspace: string; peers: unknown[]; conclusions: unknown[] };
    expect(payload.workspace).toBe("oasis");
    expect(payload.peers).toHaveLength(2);
    expect(payload.conclusions).toHaveLength(1);
  });

  it("exports markdown with peer card and conclusion sections", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/export?format=markdown"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    const body = await response.text();
    expect(body).toContain("# Honcho export — oasis");
    expect(body).toContain("### hermes");
    expect(body).toContain("- Runs local models");
    expect(body).toContain("- [explicit] Kevin prefers local models.");
  });

  it("rejects unsupported formats", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/export?format=xml"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toHaveProperty("error");
  });
});
