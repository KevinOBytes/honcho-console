/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { GET } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

function conclusion(id: string, content: string, created_at = "2026-09-01T00:00:00Z") {
  return {
    id,
    content,
    observer_id: "hermes",
    observed_id: "kevo",
    session_id: "s1",
    level: "explicit",
    times_derived: 2,
    created_at,
  };
}

describe("GET /api/[workspace]/triage", () => {
  let client: { listConclusions: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { listConclusions: vi.fn() };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("groups near-duplicate conclusions and reports truncation", async () => {
    const items = [
      conclusion("a", "Kevin prefers direct practical prose over flattery"),
      conclusion("b", "Kevin prefers direct, practical prose over flattery"),
      conclusion("c", "Kevin hates verbose filler everywhere"),
    ];
    client.listConclusions.mockResolvedValue({ items, total: 3, page: 1, size: 100, pages: 1 });

    const response = await GET(new NextRequest("http://localhost/api/oasis/triage"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.analyzed).toBe(3);
    expect(payload.totalAvailable).toBe(3);
    expect(payload.truncated).toBe(false);
    expect(payload.groups).toHaveLength(1);
    expect(payload.groups[0].members.map((member: { id: string }) => member.id)).toEqual(["a", "b"]);
    expect(payload.groups[0].maxSimilarity).toBeGreaterThan(0.8);
  });

  it("forwards observer and observed filters to the listing", async () => {
    client.listConclusions.mockResolvedValue({ items: [], total: 0, page: 1, size: 100, pages: 1 });

    const response = await GET(new NextRequest("http://localhost/api/oasis/triage?observer_id=hermes&observed_id=kevo"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });

    expect(response.status).toBe(200);
    expect(client.listConclusions).toHaveBeenCalledWith("oasis", {
      page: 1,
      size: 100,
      filters: { observer_id: "hermes", observed_id: "kevo" },
    });
  });

  it("rejects an invalid observer filter", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/triage?observer_id=../etc"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });
    expect(response.status).toBe(400);
  });

  it("truncates returned group content", async () => {
    client.listConclusions.mockResolvedValue({
      items: [
        conclusion("a", "x".repeat(1000)),
        conclusion("b", `${"x".repeat(1000)}!`),
      ],
      total: 2,
      page: 1,
      size: 100,
      pages: 1,
    });
    const response = await GET(new NextRequest("http://localhost/api/oasis/triage"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });
    const payload = await response.json();
    expect(payload.groups[0].members[0].content.length).toBeLessThanOrEqual(303);
  });
});