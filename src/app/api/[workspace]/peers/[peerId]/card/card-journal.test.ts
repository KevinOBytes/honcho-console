/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";
import { recordChange } from "@/lib/change-journal";

import { PUT } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

vi.mock("@/lib/change-journal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/change-journal")>();
  return { ...actual, recordChange: vi.fn().mockResolvedValue(undefined) };
});

const mockedGetHonchoClient = vi.mocked(getHonchoClient);
const mockedRecordChange = vi.mocked(recordChange);

const routeContext = { params: Promise.resolve({ workspace: "oasis", peerId: "hermes" }) };

describe("peer card mutation journaling", () => {
  let client: { setPeerCard: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { setPeerCard: vi.fn() };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
    mockedRecordChange.mockClear().mockResolvedValue(undefined);
  });

  it("records a journal entry when a peer card is replaced", async () => {
    client.setPeerCard.mockResolvedValue(["New fact"]);

    const response = await PUT(
      new NextRequest("http://localhost/api/oasis/peers/hermes/card", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ facts: ["New fact"] }),
      }),
      routeContext,
    );

    expect(response.status).toBe(200);
    expect(mockedRecordChange).toHaveBeenCalledTimes(1);
    const entry = mockedRecordChange.mock.calls[0]?.[0];
    expect(entry?.action).toBe("card-update");
    expect(entry?.peer).toBe("hermes");
    expect(entry?.after).toContain("New fact");
  });

  it("does not journal an invalid card payload", async () => {
    await PUT(
      new NextRequest("http://localhost/api/oasis/peers/hermes/card", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ facts: "not-an-array" }),
      }),
      routeContext,
    ).catch(() => undefined);
    expect(mockedRecordChange).not.toHaveBeenCalled();
    expect(client.setPeerCard).not.toHaveBeenCalled();
  });
});
