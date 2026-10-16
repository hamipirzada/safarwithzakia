import { describe, expect, it } from "vitest";
import { parseRange, rangeBuckets } from "@/server/dashboard";

describe("dashboard periods", () => {
  it("uses India-time calendar days, oldest first, ending today", () => {
    // 20:00 UTC on 31 Dec is already 1 Jan in India.
    const { buckets, start, unit } = rangeBuckets("7d", new Date("2026-12-31T20:00:00Z"));
    expect(unit).toBe("day");
    expect(buckets).toEqual(["2026-12-26", "2026-12-27", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"]);
    // Midnight IST on 26 Dec = 18:30 UTC on 25 Dec
    expect(start.toISOString()).toBe("2026-12-25T18:30:00.000Z");
  });

  it("covers 30 and 90 days exactly", () => {
    expect(rangeBuckets("30d", new Date("2026-10-16T06:00:00Z")).buckets).toHaveLength(30);
    expect(rangeBuckets("90d", new Date("2026-10-16T06:00:00Z")).buckets).toHaveLength(90);
  });

  it("covers twelve calendar months including the current one", () => {
    const { buckets, start, unit } = rangeBuckets("12m", new Date("2026-10-16T06:00:00Z"));
    expect(unit).toBe("month");
    expect(buckets[0]).toBe("2025-11");
    expect(buckets.at(-1)).toBe("2026-10");
    expect(buckets).toHaveLength(12);
    expect(start.toISOString()).toBe("2025-10-31T18:30:00.000Z");
  });

  it("falls back to 30 days for unknown periods", () => {
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("forever")).toBe("30d");
    expect(parseRange(undefined)).toBe("30d");
  });
});
