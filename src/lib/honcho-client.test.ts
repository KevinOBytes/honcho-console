/** @vitest-environment node */

import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { HonchoClient, parseResourceId, parseWorkspaceId } from "./honcho-client";

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

async function listen(
  handler: RequestListener,
): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("parseWorkspaceId", () => {
  it("accepts Honcho identifiers and rejects path-like input", () => {
    expect(parseWorkspaceId("oasis_2-prod")).toBe("oasis_2-prod");
    expect(parseResourceId("session_123", "session")).toBe("session_123");
    expect(() => parseWorkspaceId("../keys")).toThrow("workspace");
    expect(() => parseResourceId("../messages", "message")).toThrow("message");
  });
});

describe("HonchoClient", () => {
  it("lists available workspaces through an authenticated v3 request", async () => {
    let requestPath = "";
    let authorization = "";
    const baseUrl = await listen((request, response) => {
      requestPath = request.url ?? "";
      authorization = request.headers.authorization ?? "";
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          items: [
            {
              id: "oasis",
              created_at: "2026-09-04T12:00:00Z",
              metadata: {},
              configuration: {},
            },
          ],
          total: 1,
          page: 1,
          size: 100,
          pages: 1,
        }),
      );
    });

    const client = new HonchoClient({
      apiKey: "workspace-token",
      baseUrl,
      workspace: null,
      isRemote: false,
    });

    await expect(client.listWorkspaces()).resolves.toMatchObject({
      items: [{ id: "oasis" }],
      total: 1,
    });
    expect(requestPath).toBe("/v3/workspaces/list?page=1&size=100");
    expect(authorization).toBe("Bearer workspace-token");
  });

  it("loads every workspace page when discovery spans multiple pages", async () => {
    const requestedPages: string[] = [];
    const baseUrl = await listen((request, response) => {
      const page = new URL(request.url ?? "/", "http://localhost").searchParams.get("page") ?? "1";
      requestedPages.push(page);
      response.setHeader("content-type", "application/json");
      const item = (id: string) => ({ id, created_at: "2026-09-04T12:00:00Z", metadata: {}, configuration: {} });
      response.end(JSON.stringify({
        items: [item(`workspace-${page}`)],
        total: 201,
        page: Number(page),
        size: 100,
        pages: 3,
      }));
    });
    const client = new HonchoClient({ apiKey: "workspace-token", baseUrl, workspace: null, isRemote: false });

    await expect(client.listAllWorkspaces()).resolves.toMatchObject({
      items: [
        expect.objectContaining({ id: "workspace-1" }),
        expect.objectContaining({ id: "workspace-2" }),
        expect.objectContaining({ id: "workspace-3" }),
      ],
      truncated: false,
    });
    expect(requestedPages.sort()).toEqual(["1", "2", "3"]);
  });

  it("bounds workspace discovery and reports truncation", async () => {
    const requestedPages: string[] = [];
    const baseUrl = await listen((request, response) => {
      const page = new URL(request.url ?? "/", "http://localhost").searchParams.get("page") ?? "1";
      requestedPages.push(page);
      response.setHeader("content-type", "application/json");
      const items = Array.from({ length: 100 }, (_, index) => ({
        id: `workspace-${page}-${index}`,
        created_at: "2026-09-04T12:00:00Z",
        metadata: {},
        configuration: {},
      }));
      response.end(JSON.stringify({ items, total: 2_100, page: Number(page), size: 100, pages: 21 }));
    });
    const client = new HonchoClient({ apiKey: "workspace-token", baseUrl, workspace: null, isRemote: false });

    const result = await client.listAllWorkspaces();

    expect(result.items).toHaveLength(2_000);
    expect(result.truncated).toBe(true);
    expect(requestedPages).toHaveLength(20);
    expect(Math.max(...requestedPages.map(Number))).toBe(20);
  });

  it("sends the required observer and observed filters for semantic search", async () => {
    let body = "";
    const baseUrl = await listen((request, response) => {
      body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        response.setHeader("content-type", "application/json");
        response.end("[]");
      });
    });

    const client = new HonchoClient({ apiKey: "works...en", baseUrl, workspace: "oasis", isRemote: false });
    await expect(client.queryConclusions("oasis", "science", { observer: "hermes", observed: "kevo" }, 5)).resolves.toEqual([]);
    expect(JSON.parse(body)).toEqual({
      query: "science",
      top_k: 5,
      filters: { observer: "hermes", observed: "kevo" },
    });
  });

  it("rejects semantic search without a relationship", async () => {
    const baseUrl = await listen((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end("[]");
    });
    const client = new HonchoClient({ apiKey: "works...en", baseUrl, workspace: "oasis", isRemote: false });
    await expect(client.queryConclusions("oasis", "science", { observer: "", observed: "kevo" })).rejects.toThrow("observer");
  });

  it("rejects semantic search queries over the API limit before making a request", async () => {
    let requestCount = 0;
    const baseUrl = await listen((_request, response) => {
      requestCount += 1;
      response.setHeader("content-type", "application/json");
      response.end("[]");
    });
    const client = new HonchoClient({ apiKey: "works...en", baseUrl, workspace: "oasis", isRemote: false });
    await expect(client.queryConclusions("oasis", "x".repeat(501), { observer: "hermes", observed: "kevo" })).rejects.toThrow("500 characters");
    expect(requestCount).toBe(0);
  });

  it("includes required semantic relationship filters in the query request", async () => {
    let requestBody = "";
    const baseUrl = await listen((request, response) => {
      request.on("data", (chunk) => { requestBody += chunk; });
      request.on("end", () => {
        response.setHeader("content-type", "application/json");
        response.end("[]");
      });
    });
    const client = new HonchoClient({ apiKey: "works...en", baseUrl, workspace: "oasis", isRemote: false });
    await client.queryConclusions("oasis", "science", { observer: "hermes", observed: "kevo" }, 1);
    expect(JSON.parse(requestBody)).toMatchObject({
      query: "science",
      top_k: 1,
      filters: { observer: "hermes", observed: "kevo" },
    });
  });

  it("trims semantic queries and includes an optional level filter", async () => {
    let requestBody = "";
    const baseUrl = await listen((request, response) => {
      request.on("data", (chunk) => { requestBody += chunk; });
      request.on("end", () => {
        response.setHeader("content-type", "application/json");
        response.end("[]");
      });
    });
    const client = new HonchoClient({ apiKey: "works...en", baseUrl, workspace: "oasis", isRemote: false });
    await client.queryConclusions("oasis", "  science  ", { observer: "hermes", observed: "kevo", level: "deductive" }, 7);
    expect(JSON.parse(requestBody)).toEqual({
      query: "science",
      top_k: 7,
      filters: { observer: "hermes", observed: "kevo", level: "deductive" },
    });
  });

  it("uses a finite default when semantic result size is not finite", async () => {
    let requestBody = "";
    const baseUrl = await listen((request, response) => {
      request.on("data", (chunk) => { requestBody += chunk; });
      request.on("end", () => {
        response.setHeader("content-type", "application/json");
        response.end("[]");
      });
    });
    const client = new HonchoClient({ apiKey: "workspace-token", baseUrl, workspace: "oasis", isRemote: false });
    await client.queryConclusions("oasis", "science", { observer: "hermes", observed: "kevo" }, Number.NaN);
    expect(JSON.parse(requestBody).top_k).toBe(20);
  });

  it("loads a workspace dashboard from independent v3 resources", async () => {
    const requests: string[] = [];
    const baseUrl = await listen((request, response) => {
      requests.push(request.url ?? "");
      response.setHeader("content-type", "application/json");
      if (request.url?.includes("/peers/list")) {
        response.end(JSON.stringify({ items: [], total: 0, page: 1, size: 100, pages: 0 }));
      } else if (request.url?.includes("/sessions/list")) {
        response.end(JSON.stringify({ items: [], total: 0, page: 1, size: 50, pages: 0 }));
      } else if (request.url?.includes("/conclusions/list")) {
        response.end(JSON.stringify({ items: [], total: 0, page: 1, size: 50, pages: 0 }));
      } else {
        response.end(JSON.stringify({ total_work_units: 0, completed_work_units: 0, in_progress_work_units: 0, pending_work_units: 0 }));
      }
    });

    const client = new HonchoClient({ apiKey: "workspace-token", baseUrl, workspace: "oasis", isRemote: false });
    await expect(Promise.all([
      client.listPeers("oasis"),
      client.listSessions("oasis"),
      client.listConclusions("oasis"),
      client.getQueueStatus("oasis"),
    ])).resolves.toHaveLength(4);
    expect(requests).toEqual(expect.arrayContaining([
      "/v3/workspaces/oasis/peers/list?page=1&size=100",
      "/v3/workspaces/oasis/sessions/list?page=1&size=50",
      "/v3/workspaces/oasis/conclusions/list?page=1&size=50",
      "/v3/workspaces/oasis/queue/status",
    ]));
  });

  it("rejects queue responses that omit required work-unit fields", async () => {
    const baseUrl = await listen((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ pending_work_units: 0 }));
    });
    const client = new HonchoClient({ apiKey: "workspace-token", baseUrl, workspace: "oasis", isRemote: false });
    await expect(client.getQueueStatus("oasis")).rejects.toThrow();
  });

  it("bounds and redacts upstream error details", async () => {
    const secret = "super-secret-token";
    const baseUrl = await listen((_request, response) => {
      response.statusCode = 502;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ detail: `authorization: Bearer ${secret} ${"x".repeat(700)}` }));
    });
    const client = new HonchoClient({ apiKey: "workspace-token", baseUrl, workspace: "oasis", isRemote: false });
    await expect(client.listWorkspaces()).rejects.toThrow(/\[redacted\]/);
    await expect(client.listWorkspaces()).rejects.not.toThrow(secret);
  });

  it("allows conclusion pages beyond the first hundred", async () => {
    let requestPath = "";
    const baseUrl = await listen((request, response) => {
      requestPath = request.url ?? "";
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ items: [], total: 0, page: 101, size: 30, pages: 0 }));
    });
    const client = new HonchoClient({ apiKey: "works...en", baseUrl, workspace: "oasis", isRemote: false });
    await client.listConclusions("oasis", { page: 101, size: 30 });
    expect(requestPath).toBe("/v3/workspaces/oasis/conclusions/list?page=101&size=30");
  });

  it("sends the complete peer card without silently truncating facts", async () => {
    let requestBody = "";
    const baseUrl = await listen((request, response) => {
      request.on("data", (chunk) => { requestBody += chunk; });
      request.on("end", () => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ peer_card: Array.from({ length: 101 }, (_, index) => `fact-${index}`) }));
      });
    });
    const client = new HonchoClient({ apiKey: "works...en", baseUrl, workspace: "oasis", isRemote: false });
    const facts = Array.from({ length: 101 }, (_, index) => ` fact-${index} `);
    await client.setPeerCard("oasis", "hermes", facts);
    expect(JSON.parse(requestBody).peer_card).toHaveLength(101);
    expect(JSON.parse(requestBody).peer_card[100]).toBe("fact-100");
  });

  it("rejects invalid peer and target identifiers before making a request", async () => {
    let requests = 0;
    const baseUrl = await listen((_request, response) => {
      requests += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ peer_id: "hermes", target_id: "kevo", representation: null, peer_card: null }));
    });
    const client = new HonchoClient({ apiKey: "works...en", baseUrl, workspace: "oasis", isRemote: false });

    await expect(client.getPeerContext("oasis", "bad/id")).rejects.toThrow("peer");
    await expect(client.getPeerContext("oasis", "hermes", "bad/id")).rejects.toThrow("target");
    await expect(client.setPeerCard("oasis", "bad/id", [])).rejects.toThrow("peer");
    expect(requests).toBe(0);
  });

  it("rejects peer cards exceeding count or serialized size before making a request", async () => {
    let requests = 0;
    const baseUrl = await listen((_request, response) => {
      requests += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ peer_card: [] }));
    });
    const client = new HonchoClient({ apiKey: "works...en", baseUrl, workspace: "oasis", isRemote: false });

    await expect(client.setPeerCard("oasis", "hermes", Array.from({ length: 513 }, (_, index) => `fact-${index}`))).rejects.toThrow();
    await expect(client.setPeerCard("oasis", "hermes", Array.from({ length: 130 }, () => "x".repeat(2_000)))).rejects.toThrow();
    expect(requests).toBe(0);
  });

  it("rejects peer cards whose UTF-8 serialized payload exceeds the bound", async () => {
    let requests = 0;
    const baseUrl = await listen((_request, response) => {
      requests += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ peer_card: [] }));
    });
    const client = new HonchoClient({ apiKey: "works...en", baseUrl, workspace: "oasis", isRemote: false });
    const facts = Array.from({ length: 128 }, () => "é".repeat(1_990));

    await expect(client.setPeerCard("oasis", "hermes", facts)).rejects.toThrow();
    expect(requests).toBe(0);
  });

  it("redacts bearer and API-key-shaped values from upstream error details", async () => {
    const secret = "sk-live-super-secret-token";
    const baseUrl = await listen((_request, response) => {
      response.statusCode = 502;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ detail: `upstream rejected Bearer ${secret}` }));
    });
    const client = new HonchoClient({ apiKey: "works...en", baseUrl, workspace: "oasis", isRemote: false });

    await expect(client.listWorkspaces()).rejects.not.toThrow(secret);
    await expect(client.listWorkspaces()).rejects.toThrow(/\[redacted\]/);
  });
});
