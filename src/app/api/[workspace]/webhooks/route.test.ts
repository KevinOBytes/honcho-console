/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { GET } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

describe("GET /api/[workspace]/webhooks", () => {
  let client: { listWebhooks: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = {
      listWebhooks: vi.fn().mockResolvedValue({
        items: [
          { id: "wh-1", workspace_id: "oasis", url: "https://example.invalid/hook", created_at: "2026-09-05T12:00:00Z" },
        ],
        total: 1,
        page: 1,
        size: 100,
        pages: 1,
      }),
    };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("returns the webhook endpoints", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/webhooks"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      workspace: "oasis",
      total: 1,
      webhooks: [{ id: "wh-1", url: "https://example.invalid/hook" }],
    });
  });

  it("surfaces upstream failures as a 502", async () => {
    client.listWebhooks.mockRejectedValue(new Error("Honcho returned HTTP 500."));
    const response = await GET(new NextRequest("http://localhost/api/oasis/webhooks"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });
    expect(response.status).toBe(502);
  });
});