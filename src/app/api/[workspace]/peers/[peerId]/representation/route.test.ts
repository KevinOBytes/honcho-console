/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { POST } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

const routeContext = { params: Promise.resolve({ workspace: "oasis", peerId: "hermes" }) };

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/oasis/peers/hermes/representation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/[workspace]/peers/[peerId]/representation", () => {
  let client: { getWorkingRepresentation: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { getWorkingRepresentation: vi.fn() };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("fetches a scoped representation with validated bounds", async () => {
    client.getWorkingRepresentation.mockResolvedValue({ representation: "scoped view" });

    const response = await POST(
      makeRequest({ target: "kevo", search_query: "tea", search_top_k: 25, max_conclusions: 10, include_most_frequent: true }),
      routeContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ representation: "scoped view" });
    expect(client.getWorkingRepresentation).toHaveBeenCalledWith("oasis", "hermes", {
      target: "kevo",
      searchQuery: "tea",
      searchTopK: 25,
      maxConclusions: 10,
      includeMostFrequent: true,
    });
  });

  it("rejects out-of-range bounds before contacting Honcho", async () => {
    const response = await POST(makeRequest({ search_top_k: 0 }), routeContext);
    expect(response.status).toBe(400);
    expect(client.getWorkingRepresentation).not.toHaveBeenCalled();
  });

  it("returns 502 when Honcho fails", async () => {
    client.getWorkingRepresentation.mockRejectedValue(new Error("Honcho returned HTTP 503."));
    const response = await POST(makeRequest({}), routeContext);
    expect(response.status).toBe(502);
  });
});
