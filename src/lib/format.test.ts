import { describe, expect, it } from "vitest";

import { compactId, formatDate, jsonPreview } from "./format";

describe("format helpers", () => {
  it("renders a bounded identifier", () => {
    expect(compactId("abcdefghijklmnop", 8)).toBe("abcdefg…");
  });

  it("renders malformed dates without throwing", () => {
    expect(formatDate("not-a-date")).toBe("Unknown");
    expect(formatDate(null)).toBe("—");
  });

  it("keeps metadata inspectable without inventing an empty object", () => {
    expect(jsonPreview({})).toBe("No metadata");
    expect(jsonPreview({ source: "test" })).toContain('"source": "test"');
  });
});
