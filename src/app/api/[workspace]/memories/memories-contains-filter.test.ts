/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { GET } from "./route";

vi.mock("@/lib/server", () => ({ getHonchoClient: vi.fn() }));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

describe("GET /api/[workspace]/memories text filter", () => {
  let client: { listConclusions: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { listConclusions: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, size: 30, pages: 0 }) };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("passes a trimmed contains filter to chronological browsing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/oasis/memories?page=1&size=30&contains=%20implant%20"), { params: Promise.resolve({ workspace: "oasis" }) });
    expect(response.status).toBe(200);
    expect(client.listConclusions).toHaveBeenCalledWith("oasis", { page: 1, size: 30, filters: { contains: "implant" } });
  });

  it("rejects an oversized contains filter", async () => {
    const response = await GET(new NextRequest(`http://localhost/api/oasis/memories?contains=${"x".repeat(501)}`), { params: Promise.resolve({ workspace: "oasis" }) });
    expect(response.status).toBe(400);
    expect(client.listConclusions).not.toHaveBeenCalled();
  });
});
