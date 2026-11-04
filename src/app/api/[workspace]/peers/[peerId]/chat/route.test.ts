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
  return new NextRequest("http://localhost/api/oasis/peers/hermes/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/[workspace]/peers/[peerId]/chat", () => {
  let client: { chatWithPeer: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { chatWithPeer: vi.fn() };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("streams the upstream response when stream is requested", async () => {
    const upstream = new Response('data: {"content":"Kevin prefers local models."}\n\n', {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
    client.chatWithPeer.mockResolvedValue(upstream);

    const response = await POST(makeRequest({ query: "what do you know?", stream: true }), routeContext);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-cache");
    await expect(response.text()).resolves.toContain("Kevin prefers local models.");
    expect(client.chatWithPeer).toHaveBeenCalledWith(
      "oasis",
      "hermes",
      expect.objectContaining({ query: "what do you know?", stream: true } as never),
    );
  });

  it("rejects a non-stream upstream answer for a streaming request", async () => {
    client.chatWithPeer.mockResolvedValue({ content: "plain answer" });

    const response = await POST(makeRequest({ query: "what do you know?", stream: true }), routeContext);

    expect(response.status).toBe(502);
    expect(client.chatWithPeer).toHaveBeenCalledWith("oasis", "hermes", expect.objectContaining({ stream: true } as never));
  });

  it("rejects an empty query before contacting Honcho", async () => {
    const response = await POST(makeRequest({ query: "   " }), routeContext);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toHaveProperty("error");
    expect(client.chatWithPeer).not.toHaveBeenCalled();
  });

  it("rejects a query above the 10,000 character bound", async () => {
    const response = await POST(makeRequest({ query: "x".repeat(10_001) }), routeContext);
    expect(response.status).toBe(400);
    expect(client.chatWithPeer).not.toHaveBeenCalled();
  });

  it("rejects an unknown reasoning level", async () => {
    const response = await POST(makeRequest({ query: "hi", reasoning_level: "extreme" }), routeContext);
    expect(response.status).toBe(400);
    expect(client.chatWithPeer).not.toHaveBeenCalled();
  });

  it("forwards the validated dialectic request and returns the answer", async () => {
    client.chatWithPeer.mockResolvedValue({ content: "Kevin prefers local models." });

    const response = await POST(
      makeRequest({ query: "  What does kevo prefer? ", target: "kevo", session_id: "s1", reasoning_level: "high" }),
      routeContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ content: "Kevin prefers local models." });
    expect(client.chatWithPeer).toHaveBeenCalledWith("oasis", "hermes", {
      query: "What does kevo prefer?",
      target: "kevo",
      sessionId: "s1",
      reasoningLevel: "high",
    });
  });

  it("returns 502 when Honcho fails", async () => {
    client.chatWithPeer.mockRejectedValue(new Error("Honcho returned HTTP 503."));
    const response = await POST(makeRequest({ query: "hi" }), routeContext);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toHaveProperty("error");
  });
});
