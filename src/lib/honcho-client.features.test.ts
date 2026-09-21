/** @vitest-environment node */

import { afterEach, describe, expect, it } from "vitest";

import { HonchoClient } from "./honcho-client";
import type { HonchoConfig } from "./honcho-config";

import { createServer, type IncomingMessage, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
});

async function listen(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const config: HonchoConfig = {
  apiKey: "test-key",
  baseUrl: "http://placeholder",
  workspace: "oasis",
  isRemote: false,
};
function clientWith(baseUrl: string): HonchoClient {
  return new HonchoClient({ ...config, baseUrl });
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    request.on("data", (chunk) => (data += chunk));
    request.on("end", () => resolve(data));
  });
}

describe("HonchoClient dialectic and retrieval additions", () => {
  afterEach(() => {
    delete process.env.HONCHO_CONSOLE_JOURNAL_PATH;
  });

  it("chats with a peer via POST and returns the answer content", async () => {
    let method = "";
    let path = "";
    let body = "";
    const baseUrl = await listen(async (request, response) => {
      method = request.method ?? "";
      path = request.url ?? "";
      body = await readBody(request);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ content: "You asked about models." }));
    });

    const result = await clientWith(baseUrl).chatWithPeer("oasis", "hermes", {
      query: "  What does kevo prefer?  ",
      target: "kevo",
      sessionId: "session-1",
      reasoningLevel: "medium",
    });

    expect(result.content).toBe("You asked about models.");
    expect(method).toBe("POST");
    expect(path).toBe(`/v3/workspaces/oasis/peers/hermes/chat`);
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed).toEqual({
      query: "What does kevo prefer?",
      stream: false,
      reasoning_level: "medium",
      target: "kevo",
      session_id: "session-1",
    });
  });

  it("rejects chat queries that are empty or over the bound", async () => {
    const client = clientWith("http://127.0.0.1:1");
    await expect(client.chatWithPeer("oasis", "hermes", { query: "   " })).rejects.toThrow(/1 and 10,000/);
    await expect(client.chatWithPeer("oasis", "hermes", { query: "x".repeat(10_001) })).rejects.toThrow(/1 and 10,000/);
  });

  it("defaults the reasoning level to low", async () => {
    let body = "";
    const baseUrl = await listen(async (request, response) => {
      body = await readBody(request);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ content: null }));
    });

    const result = await clientWith(baseUrl).chatWithPeer("oasis", "hermes", { query: "hello" });
    expect(result.content).toBeNull();
    expect((JSON.parse(body) as Record<string, unknown>).reasoning_level).toBe("low");
  });

  it("rejects unknown reasoning levels", async () => {
    const client = clientWith("http://127.0.0.1:1");
    await expect(
      client.chatWithPeer("oasis", "hermes", { query: "hello", reasoningLevel: "extreme" as never }),
    ).rejects.toThrow(/reasoning level/i);
  });

  it("fetches a scoped working representation", async () => {
    let path = "";
    let body = "";
    const baseUrl = await listen(async (request, response) => {
      path = request.url ?? "";
      body = await readBody(request);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ representation: "kevo likes mint tea" }));
    });

    const result = await clientWith(baseUrl).getWorkingRepresentation("oasis", "hermes", {
      target: "kevo",
      searchQuery: "tea",
      searchTopK: 500,
      maxConclusions: 10,
    });

    expect(result.representation).toBe("kevo likes mint tea");
    expect(path).toBe(`/v3/workspaces/oasis/peers/hermes/representation`);
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed.target).toBe("kevo");
    expect(parsed.search_query).toBe("tea");
    expect(parsed.search_top_k).toBe(100);
    expect(parsed.max_conclusions).toBe(10);
    expect(parsed.include_most_frequent).toBeUndefined();
  });

  it("rejects non-finite representation bounds", async () => {
    const client = clientWith("http://127.0.0.1:1");
    await expect(
      client.getWorkingRepresentation("oasis", "hermes", { searchTopK: Number.NaN }),
    ).rejects.toThrow(/search_top_k|topK/i);
    await expect(
      client.getWorkingRepresentation("oasis", "hermes", { maxConclusions: Number.POSITIVE_INFINITY }),
    ).rejects.toThrow(/max_conclusions|maxConclusions/i);
    await expect(
      client.getWorkingRepresentation("oasis", "hermes", { searchMaxDistance: Number.NaN }),
    ).rejects.toThrow(/distance/i);
  });

  it("clamps out-of-range representation bounds into the documented ranges", async () => {
    let body = "";
    const baseUrl = await listen(async (request, response) => {
      body = await readBody(request);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ representation: "ok" }));
    });

    await clientWith(baseUrl).getWorkingRepresentation("oasis", "hermes", {
      searchQuery: "tea",
      searchTopK: 500,
      maxConclusions: 0,
      searchMaxDistance: 1.5,
      includeMostFrequent: true,
    });

    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed.search_top_k).toBe(100);
    expect(parsed.max_conclusions).toBe(1);
    expect(parsed.search_max_distance).toBe(1);
    expect(parsed.include_most_frequent).toBe(true);
  });

  it("lists session summaries", async () => {
    let path = "";
    let method = "";
    const baseUrl = await listen(async (request, response) => {
      method = request.method ?? "";
      path = request.url ?? "";
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          id: "session-1",
          short_summary: {
            content: "Short recap.",
            message_id: "message-9",
            summary_type: "short",
            created_at: "2026-09-20T00:00:00Z",
            token_count: 12,
          },
          long_summary: null,
        }),
      );
    });

    const summaries = await clientWith(baseUrl).listSessionSummaries("oasis", "session-1");
    expect(method).toBe("GET");
    expect(path).toBe(`/v3/workspaces/oasis/sessions/session-1/summaries`);
    expect(summaries.short_summary?.content).toBe("Short recap.");
    expect(summaries.long_summary).toBeNull();
  });

  it("searches workspace and peer messages", async () => {
    const message = {
      id: "message-1",
      content: "found it",
      peer_id: "kevo",
      session_id: "session-2",
      metadata: {},
      created_at: "2026-09-20T00:00:00Z",
      workspace_id: "oasis",
      token_count: 3,
    };
    let searchPath = "";
    let searchBody = "";
    let peerPath = "";
    const baseUrl = await listen(async (request, response) => {
      if ((request.url ?? "").includes("/peers/kevo/search")) {
        peerPath = request.url ?? "";
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify([message]));
        return;
      }
      searchPath = request.url ?? "";
      searchBody = await readBody(request);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify([message]));
    });

    const client = clientWith(baseUrl);
    const workspaceHits = await client.searchMessages("oasis", "found", 50);
    const peerHits = await client.searchPeerMessages("oasis", "kevo", "found", 10);

    expect(searchPath).toBe(`/v3/workspaces/oasis/search`);
    expect(JSON.parse(searchBody)).toEqual({ query: "found", limit: 50 });
    expect(peerPath).toBe(`/v3/workspaces/oasis/peers/kevo/search`);
    expect(workspaceHits).toHaveLength(1);
    expect(peerHits[0]?.session_id).toBe("session-2");
  });

  it("rejects message search queries that are empty or over the bound", async () => {
    const client = clientWith("http://127.0.0.1:1");
    await expect(client.searchMessages("oasis", "   ")).rejects.toThrow(/1 and 500/);
    await expect(client.searchMessages("oasis", "x".repeat(501))).rejects.toThrow(/1 and 500/);
    await expect(client.searchMessages("oasis", "ok", 0)).rejects.toThrow(/limit/i);
    await expect(client.searchMessages("oasis", "ok", 101)).rejects.toThrow(/limit/i);
  });

  it("schedules a dream and treats a 204 as success", async () => {
    let method = "";
    let path = "";
    let body = "";
    const baseUrl = await listen(async (request, response) => {
      method = request.method ?? "";
      path = request.url ?? "";
      body = await readBody(request);
      response.statusCode = 204;
      response.end();
    });

    await clientWith(baseUrl).scheduleDream("oasis", {
      observer: "hermes",
      observed: "kevo",
      dreamType: "card_refresh",
      rebuild: true,
    });

    expect(method).toBe("POST");
    expect(path).toBe(`/v3/workspaces/oasis/schedule_dream`);
    expect(JSON.parse(body)).toEqual({
      observer: "hermes",
      observed: "kevo",
      dream_type: "card_refresh",
      rebuild: true,
    });
  });

  it("rejects dream types outside the supported set", async () => {
    const client = clientWith("http://127.0.0.1:1");
    await expect(
      client.scheduleDream("oasis", { observer: "hermes", dreamType: "lucid" as never }),
    ).rejects.toThrow(/dream type/i);
  });

  it("passes a session filter through conclusions list", async () => {
    let body = "";
    const baseUrl = await listen(async (request, response) => {
      body = await readBody(request);
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({ items: [], total: 0, page: 1, size: 50, pages: 0 }),
      );
    });

    await clientWith(baseUrl).listConclusions("oasis", {
      filters: { session_id: "session-7" },
    });

    const filters = (JSON.parse(body) as { filters: Record<string, string> }).filters;
    expect(filters.session_id).toBe("session-7");
  });
});

