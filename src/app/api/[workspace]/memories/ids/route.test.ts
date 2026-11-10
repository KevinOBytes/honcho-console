/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";

import { GET } from "./route";

vi.mock("@/lib/server", () => ({ getHonchoClient: vi.fn() }));

const mockedGetHonchoClient = vi.mocked(getHonchoClient);

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/oasis/memories/ids${query}`), { params: Promise.resolve({ workspace: "oasis" }) });
}

describe("GET /api/[workspace]/memories/ids", () => {
  let client: { listConclusions: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = {
      listConclusions: vi.fn(async (_workspace: string, options: { page: number }) => ({
        items: options.page === 1 ? [{ id: "c1" }, { id: "c2" }] : [{ id: "c3" }],
        total: 3,
        page: options.page,
        size: 100,
        pages: 2,
      })),
    };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
  });

  it("collects every matching id across pages with the same filters as browsing", async () => {
    const response = await get("?observer_id=hermes&level=explicit&contains=nic.in");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ids: ["c1", "c2", "c3"], total: 3, truncated: false });
    expect(client.listConclusions).toHaveBeenCalledWith("oasis", { page: 1, size: 100, filters: { observer_id: "hermes", level: "explicit", contains: "nic.in" } });
  });

  it("rejects invalid filters before calling Honcho", async () => {
    expect((await get("?observer_id=../x")).status).toBe(400);
    expect((await get("?level=bogus")).status).toBe(400);
    expect((await get(`?contains=${"x".repeat(501)}`)).status).toBe(400);
    expect(client.listConclusions).not.toHaveBeenCalled();
  });
});
