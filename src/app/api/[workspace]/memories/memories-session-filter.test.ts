/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { GET } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

const routeContext = { params: Promise.resolve({ workspace: "oasis" }) };

describe("GET /api/[workspace]/memories session filtering", () => {
  let client: { listConclusions: ReturnType<typeof vi.fn>; queryConclusions: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { listConclusions: vi.fn(), queryConclusions: vi.fn() };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("forwards a session filter to conclusions list", async () => {
    client.listConclusions.mockResolvedValue({ items: [], total: 0, page: 1, size: 30, pages: 0 });

    const response = await GET(
      new NextRequest("http://localhost/api/oasis/memories?page=1&size=30&session_id=session-7"),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(client.listConclusions).toHaveBeenCalledWith("oasis", {
      page: 1,
      size: 30,
      filters: { session_id: "session-7" },
    });
  });

  it("combines a session filter with observer and level filters", async () => {
    client.listConclusions.mockResolvedValue({ items: [], total: 0, page: 1, size: 30, pages: 0 });

    await GET(
      new NextRequest("http://localhost/api/oasis/memories?page=1&size=30&session_id=s1&observer_id=hermes&level=deductive"),
      routeContext,
    );

    expect(client.listConclusions).toHaveBeenCalledWith("oasis", {
      page: 1,
      size: 30,
      filters: { observer_id: "hermes", session_id: "s1", level: "deductive" },
    });
  });

  it("rejects an invalid session filter", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/oasis/memories?page=1&size=30&session_id=bad%2Fsession"),
      routeContext,
    );
    expect(response.status).toBe(400);
    expect(client.listConclusions).not.toHaveBeenCalled();
  });
});
