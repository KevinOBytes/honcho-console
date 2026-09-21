/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { GET } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

describe("GET /api/[workspace]/queue", () => {
  let client: { getQueueStatus: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { getQueueStatus: vi.fn() };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("returns the deriver queue status", async () => {
    const queue = { total_work_units: 5, completed_work_units: 4, in_progress_work_units: 1, pending_work_units: 0 };
    client.getQueueStatus.mockResolvedValue(queue);

    const response = await GET(new NextRequest("http://localhost/api/oasis/queue"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(queue);
  });

  it("maps upstream failures to 502", async () => {
    client.getQueueStatus.mockRejectedValue(new Error("Honcho returned HTTP 503."));
    const response = await GET(new NextRequest("http://localhost/api/oasis/queue"), {
      params: Promise.resolve({ workspace: "oasis" }),
    });
    expect(response.status).toBe(502);
  });
});
