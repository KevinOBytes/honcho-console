/** @vitest-environment node */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHonchoClient } from "@/lib/server";
import { recordChange } from "@/lib/change-journal";

import { DELETE } from "./route";

vi.mock("@/lib/server", () => ({
  getHonchoClient: vi.fn(),
}));

vi.mock("@/lib/change-journal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/change-journal")>();
  return { ...actual, recordChange: vi.fn().mockResolvedValue(undefined) };
});

const mockedGetHonchoClient = vi.mocked(getHonchoClient);
const mockedRecordChange = vi.mocked(recordChange);

describe("conclusion deletion journaling", () => {
  let client: { deleteConclusion: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    client = { deleteConclusion: vi.fn().mockResolvedValue(undefined) };
    mockedGetHonchoClient.mockResolvedValue({ client } as never);
    mockedRecordChange.mockClear().mockResolvedValue(undefined);
  });

  it("records a journal entry when a conclusion is deleted", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/api/oasis/memories/conclusion-1", { method: "DELETE" }),
      { params: Promise.resolve({ workspace: "oasis", memoryId: "conclusion-1" }) },
    );

    expect(response.status).toBe(204);
    expect(mockedRecordChange).toHaveBeenCalledTimes(1);
    const entry = mockedRecordChange.mock.calls[0]?.[0];
    expect(entry?.action).toBe("delete");
    expect(entry?.workspace).toBe("oasis");
    expect(entry?.id).toBe("conclusion-1");
  });

  it("does not journal a failed deletion", async () => {
    client.deleteConclusion.mockRejectedValue(new Error("Honcho returned HTTP 503."));
    await DELETE(
      new NextRequest("http://localhost/api/oasis/memories/conclusion-1", { method: "DELETE" }),
      { params: Promise.resolve({ workspace: "oasis", memoryId: "conclusion-1" }) },
    ).catch(() => undefined);
    expect(mockedRecordChange).not.toHaveBeenCalled();
  });
});
