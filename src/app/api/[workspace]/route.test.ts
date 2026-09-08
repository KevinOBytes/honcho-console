/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { GET } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);
const routeContext = { params: Promise.resolve({ workspace: "oasis" }) };

type FakeClient = {
  listPeers: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
  listConclusions: ReturnType<typeof vi.fn>;
  getQueueStatus: ReturnType<typeof vi.fn>;
};

function page<T>(items: T[], total = items.length) {
  return { items, total, page: 1, size: 100, pages: total ? Math.ceil(total / 100) : 0 };
}

describe("GET /api/[workspace]", () => {
  let client: FakeClient;

  beforeEach(() => {
    client = {
      listPeers: vi.fn().mockResolvedValue(page([])),
      listSessions: vi.fn().mockResolvedValue(page([])),
      listConclusions: vi.fn().mockResolvedValue(page([])),
      getQueueStatus: vi.fn().mockResolvedValue({
        total_work_units: 0,
        completed_work_units: 0,
        in_progress_work_units: 0,
        pending_work_units: 0,
      }),
    };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("preserves pagination metadata in the workspace snapshot", async () => {
    client.listPeers.mockResolvedValue(page([{ id: "peer-1" }], 201));
    client.listSessions.mockResolvedValue(page([{ id: "session-1" }], 301));

    const response = await GET({} as never, routeContext);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      workspace: "oasis",
      peers: { items: [{ id: "peer-1" }], total: 201, page: 1, size: 100, pages: 3 },
      sessions: { items: [{ id: "session-1" }], total: 301, page: 1, size: 100, pages: 4 },
    });
  });

  it("returns 400 for an invalid workspace identifier before calling Honcho", async () => {
    const response = await GET({} as never, { params: Promise.resolve({ workspace: "bad/id" }) });

    expect(response.status).toBe(400);
    expect(client.listPeers).not.toHaveBeenCalled();
  });
});
