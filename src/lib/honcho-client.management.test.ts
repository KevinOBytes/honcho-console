/** @vitest-environment node */

import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { HonchoClient } from "./honcho-client";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

type Captured = { method: string; url: string; body: unknown };

async function listen(reply: (captured: Captured) => { status: number; body?: string }): Promise<{ client: HonchoClient; requests: Captured[] }> {
  const requests: Captured[] = [];
  const handler: RequestListener = (request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      const captured = { method: request.method ?? "", url: request.url ?? "", body: raw ? JSON.parse(raw) : undefined };
      requests.push(captured);
      const { status, body } = reply(captured);
      response.statusCode = status;
      if (body !== undefined) response.setHeader("content-type", "application/json");
      response.end(body);
    });
  };
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { client: new HonchoClient({ baseUrl: `http://127.0.0.1:${port}`, apiKey: "test-key" } as never), requests };
}

const emptyPage = JSON.stringify({ items: [], total: 0, page: 1, size: 50, pages: 0 });

describe("HonchoClient management additions", () => {
  it("maps a text filter onto a case-insensitive content match", async () => {
    const { client, requests } = await listen(() => ({ status: 200, body: emptyPage }));
    await client.listConclusions("oasis", { page: 1, size: 50, filters: { observer_id: "hermes", contains: "nic.in" } });
    expect(requests[0]?.body).toEqual({ filters: { observer_id: "hermes", content: { icontains: "nic.in" } } });
  });

  it("rejects an oversized text filter before making a request", async () => {
    const { client, requests } = await listen(() => ({ status: 200, body: emptyPage }));
    await expect(client.listConclusions("oasis", { filters: { contains: "x".repeat(501) } })).rejects.toThrow("Text filter");
    expect(requests).toHaveLength(0);
  });

  it("filters sessions by id substring and keeps the empty body otherwise", async () => {
    const { client, requests } = await listen(() => ({ status: 200, body: emptyPage }));
    await client.listSessions("oasis", 1, 50, { id_contains: "2026" });
    await client.listSessions("oasis", 1, 50);
    expect(requests[0]?.body).toEqual({ filters: { id: { icontains: "2026" } } });
    expect(requests[1]?.body).toEqual({});
  });

  it("deletes a session with DELETE and accepts Honcho's 202 Accepted reply", async () => {
    const { client, requests } = await listen(() => ({ status: 202, body: "null" }));
    await client.deleteSession("oasis", "session-1");
    expect(requests[0]).toMatchObject({ method: "DELETE", url: "/v3/workspaces/oasis/sessions/session-1" });
  });

  it("deletes a webhook endpoint with DELETE", async () => {
    const { client, requests } = await listen(() => ({ status: 204 }));
    await client.deleteWebhook("oasis", "endpoint-1");
    expect(requests[0]).toMatchObject({ method: "DELETE", url: "/v3/workspaces/oasis/webhooks/endpoint-1" });
  });

  it("rejects path-like session and webhook ids before making a request", async () => {
    const { client, requests } = await listen(() => ({ status: 204 }));
    await expect(client.deleteSession("oasis", "../x")).rejects.toThrow("session");
    await expect(client.deleteWebhook("oasis", "a/b")).rejects.toThrow("webhook");
    expect(requests).toHaveLength(0);
  });

  it("surfaces an upstream failure on delete", async () => {
    const { client } = await listen(() => ({ status: 404, body: JSON.stringify({ detail: "Session not found" }) }));
    await expect(client.deleteSession("oasis", "missing")).rejects.toThrow("HTTP 404");
  });
});
