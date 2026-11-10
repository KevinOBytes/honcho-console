/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";
import { recordChange } from "@/lib/change-journal";

import { DELETE } from "./route";

vi.mock("@/lib/server", () => ({ getHonchoClient: vi.fn() }));
vi.mock("@/lib/change-journal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/change-journal")>();
  return { ...actual, recordChange: vi.fn().mockResolvedValue(undefined) };
});

const mockedGetHonchoClient = vi.mocked(getHonchoClient);
const mockedRecordChange = vi.mocked(recordChange);

describe("DELETE /api/[workspace]/webhooks/[endpointId]", () => {
  let client: { deleteWebhook: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { deleteWebhook: vi.fn().mockResolvedValue(undefined) };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
    mockedRecordChange.mockClear().mockResolvedValue(undefined);
  });

  it("deletes the endpoint and journals the deletion", async () => {
    const response = await DELETE(new NextRequest("http://localhost/api/oasis/webhooks/w1", { method: "DELETE" }), { params: Promise.resolve({ workspace: "oasis", endpointId: "w1" }) });
    expect(response.status).toBe(204);
    expect(client.deleteWebhook).toHaveBeenCalledWith("oasis", "w1");
    expect(mockedRecordChange.mock.calls[0]?.[0]).toMatchObject({ action: "webhook-delete", id: "w1" });
  });

  it("rejects an invalid endpoint id", async () => {
    const response = await DELETE(new NextRequest("http://localhost/api/oasis/webhooks/x", { method: "DELETE" }), { params: Promise.resolve({ workspace: "oasis", endpointId: "a/b" }) });
    expect(response.status).toBe(400);
    expect(client.deleteWebhook).not.toHaveBeenCalled();
  });
});
