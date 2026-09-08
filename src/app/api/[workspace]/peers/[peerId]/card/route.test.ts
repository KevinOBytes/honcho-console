/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { PUT } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);
const routeContext = { params: Promise.resolve({ workspace: "oasis", peerId: "hermes" }) };

type FakeClient = { setPeerCard: ReturnType<typeof vi.fn> };

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/oasis/peers/hermes/card", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/[workspace]/peers/[peerId]/card", () => {
  let client: FakeClient;

  beforeEach(() => {
    client = { setPeerCard: vi.fn().mockResolvedValue(["fact"]) };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("rejects malformed JSON before calling Honcho", async () => {
    const request = new NextRequest("http://localhost/api/oasis/peers/hermes/card", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await PUT(request, routeContext);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Malformed JSON body." });
    expect(client.setPeerCard).not.toHaveBeenCalled();
  });

  it("rejects overlarge peer cards before calling Honcho", async () => {
    const response = await PUT(
      makeRequest({ facts: Array.from({ length: 513 }, (_, index) => `fact-${index}`) }),
      routeContext,
    );

    expect(response.status).toBe(400);
    expect(client.setPeerCard).not.toHaveBeenCalled();
  });

  it("forwards a bounded card and optional target", async () => {
    const request = new NextRequest("http://localhost/api/oasis/peers/hermes/card?target=kevo", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ facts: [" fact one ", "fact two"] }),
    });

    const response = await PUT(request, routeContext);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ peer_card: ["fact"] });
    expect(client.setPeerCard).toHaveBeenCalledWith("oasis", "hermes", ["fact one", "fact two"], "kevo");
  });
});
