/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { GET } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

type FakeClient = {
  queryConclusions: ReturnType<typeof vi.fn>;
  listConclusions: ReturnType<typeof vi.fn>;
};

const routeContext = { params: Promise.resolve({ workspace: "oasis" }) };

function makeRequest(search = "") {
  return new NextRequest(`http://localhost/api/oasis/memories${search}`);
}

describe("GET /api/[workspace]/memories", () => {
  let client: FakeClient;

  beforeEach(() => {
    client = {
      queryConclusions: vi.fn(),
      listConclusions: vi.fn(),
    };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("returns 400 before semantic search when a relationship is missing", async () => {
    const response = await GET(
      makeRequest("?query=machine%20learning&observer_id=hermes"),
      routeContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Semantic search requires both an observer and an observed peer.",
    });
    expect(client.queryConclusions).not.toHaveBeenCalled();
  });

  it("returns 400 before semantic search for invalid relationship identifiers", async () => {
    const response = await GET(
      makeRequest("?query=machine%20learning&observer_id=bad%2Fid&observed_id=kevo"),
      routeContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid observer identifier." });
    expect(client.queryConclusions).not.toHaveBeenCalled();
  });

  it("forwards the normalized query, relationship filters, level, and result size", async () => {
    const item = {
      id: "conclusion-1",
      content: "Kevin prefers local models.",
      observer_id: "hermes",
      observed_id: "kevo",
      session_id: null,
      level: "deductive",
      created_at: "2026-09-04T12:00:00Z",
    };
    client.queryConclusions.mockResolvedValue([item]);

    const response = await GET(
      makeRequest("?query=%20machine%20learning%20&observer_id=hermes&observed_id=kevo&level=deductive&size=7"),
      routeContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [item],
      total: 1,
      page: 1,
      size: 1,
      pages: 1,
      mode: "semantic",
    });
    expect(client.queryConclusions).toHaveBeenCalledWith(
      "oasis",
      "machine learning",
      { observer: "hermes", observed: "kevo", level: "deductive" },
      7,
    );
  });
});
