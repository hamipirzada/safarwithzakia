import { describe, expect, it } from "vitest";
import {
  axisLabelIndices,
  bandPath,
  bucketHref,
  describeChange,
  formatBucket,
  formatTick,
  indexAt,
  KIND_COLORS,
  KINDS,
  labelStep,
  linePath,
  niceMax,
  percentChange,
  scales,
  share,
  stack,
  summarise,
  ticks,
  type Frame,
} from "@/components/admin/chart-math";

const frame: Frame = { width: 440, height: 240, pad: { top: 20, right: 20, bottom: 20, left: 20 } }; // inner 400 × 200

describe("axis scale", () => {
  it("rounds the maximum up to 1, 2, 2.5 or 5 × 10ⁿ, never below 4", () => {
    expect([0, 1, 4, 5, 9, 11, 21, 26, 51, 101, 240, 999].map(niceMax)).toEqual([4, 4, 4, 5, 10, 20, 25, 50, 100, 200, 250, 1000]);
    expect(niceMax(Number.NaN)).toBe(4);
  });
  it("gives five evenly spaced ticks and labels whole numbers without decimals", () => {
    expect(ticks(4)).toEqual([0, 1, 2, 3, 4]);
    expect(ticks(10)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(ticks(10).map(formatTick)).toEqual(["0", "2.5", "5", "7.5", "10"]);
  });
  it("maps values and indices into the plot area, clamping negatives to the baseline", () => {
    const { x, y } = scales(frame, 5, 4);
    expect([x(0), x(2), x(4)]).toEqual([20, 220, 420]);
    expect([y(0), y(2), y(4), y(-3)]).toEqual([220, 120, 20, 220]);
    expect(scales(frame, 1, 4).x(0)).toBe(220); // a single point is centred
  });
  it("finds the nearest point for a pointer position and clamps outside the plot", () => {
    expect(indexAt(20, frame, 5)).toBe(0);
    expect(indexAt(115, frame, 5)).toBe(1); // nearer to 120 than 20
    expect(indexAt(175, frame, 5)).toBe(2);
    expect(indexAt(-50, frame, 5)).toBe(0);
    expect(indexAt(9999, frame, 5)).toBe(4);
    expect(indexAt(300, frame, 1)).toBe(0);
  });
});

describe("paths", () => {
  it("draws straight segments through the points (no interpolation between buckets)", () => {
    expect(linePath([[0, 10], [5.25, 2], [10, 0]])).toBe("M0,10 L5.3,2 L10,0");
    expect(linePath([])).toBe("");
  });
  it("closes a band between an upper and a lower line", () => {
    expect(bandPath([[0, 1], [10, 2]], [[0, 5], [10, 5]])).toBe("M0,1 L10,2 L10,5 L0,5 Z");
    expect(bandPath([], [])).toBe("");
  });
});

describe("stacking by enquiry type", () => {
  const data = [
    { byType: { CONTACT: 1, PACKAGE: 2, CUSTOM_TRIP: 3 } },
    { byType: { CONTACT: 0, PACKAGE: 4, CUSTOM_TRIP: 0 } },
  ];
  it("accumulates layers in the fixed type order", () => {
    expect(stack(data, KINDS)).toEqual([
      { kind: "CONTACT", values: [[0, 1], [0, 0]] },
      { kind: "PACKAGE", values: [[1, 3], [0, 4]] },
      { kind: "CUSTOM_TRIP", values: [[3, 6], [4, 4]] },
    ]);
  });
  it("skips hidden types without reordering the rest (colour follows the type, never its rank)", () => {
    const layers = stack(data, ["CUSTOM_TRIP", "CONTACT"]);
    expect(layers.map((l) => l.kind)).toEqual(["CONTACT", "CUSTOM_TRIP"]);
    expect(layers[1]!.values).toEqual([[1, 4], [0, 0]]);
  });
  it("uses three fixed, distinct palette slots", () => {
    expect(new Set(Object.values(KIND_COLORS)).size).toBe(3);
    expect(KIND_COLORS).toEqual({ CONTACT: "#2a78d6", PACKAGE: "#eb6834", CUSTOM_TRIP: "#1baf7a" });
  });
});

describe("labels", () => {
  it("formats day and month buckets in Indian English", () => {
    expect(formatBucket("2026-10-03", "day")).toBe("3 Oct");
    expect(formatBucket("2026-10-03", "day", true)).toBe("3 Oct 2026");
    expect(formatBucket("2026-02", "month")).toMatch(/^Feb 2026$/);
    expect(formatBucket("2026-02", "month", true)).toBe("February 2026");
  });
  it("thins x labels by width and never lets the last two collide", () => {
    expect(labelStep(30, 600)).toBe(4);
    for (const [count, width] of [[30, 600], [7, 300], [90, 640], [12, 240], [30, 260]] as const) {
      const idx = axisLabelIndices(count, width);
      const step = labelStep(count, width);
      expect(idx[0]).toBe(0);
      expect(idx.at(-1)).toBe(count - 1);
      for (let i = 1; i < idx.length; i++) expect(idx[i]! - idx[i - 1]!, `${count}@${width}`).toBeGreaterThanOrEqual(Math.max(1, Math.ceil(step * 0.75)));
    }
    expect(axisLabelIndices(1, 400)).toEqual([0]);
    expect(axisLabelIndices(0, 400)).toEqual([]);
  });
});

describe("summaries and comparisons", () => {
  it("summarises total, average and the first busiest bucket", () => {
    expect(summarise([0, 3, 1, 3])).toEqual({ total: 7, average: 1.75, peak: { index: 1, value: 3 } });
    expect(summarise([0, 0])).toEqual({ total: 0, average: 0, peak: null });
    expect(summarise([])).toEqual({ total: 0, average: 0, peak: null });
  });
  it("never invents a percentage when the previous period had none", () => {
    expect(percentChange(5, 4)).toBe(25);
    expect(percentChange(3, 4)).toBe(-25);
    expect(percentChange(4, 4)).toBe(0);
    expect(percentChange(3, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
    expect(describeChange(5, 4, "30 days")).toBe("Up 25% on the previous 30 days");
    expect(describeChange(1, 4, "7 days")).toBe("Down 75% on the previous 7 days");
    expect(describeChange(2, 2, "7 days")).toBe("Same as the previous 7 days");
    expect(describeChange(2, 0, "7 days")).toBe("None in the previous 7 days");
    expect(describeChange(0, 0, "7 days")).toBe("None in the previous 7 days either");
  });
  it("expresses shares as whole percentages with a visible sliver marker", () => {
    expect(share(1, 4)).toBe("25%");
    expect(share(1, 3)).toBe("33%");
    expect(share(1, 300)).toBe("<1%");
    expect(share(0, 10)).toBe("0%");
    expect(share(3, 0)).toBe("0%");
  });
});

describe("click-through links", () => {
  it("links a day to that India-time day and a month to its full date span", () => {
    expect(bucketHref("2026-10-03", "day")).toBe("/admin/enquiries?from=2026-10-03&to=2026-10-03");
    expect(bucketHref("2026-02", "month")).toBe("/admin/enquiries?from=2026-02-01&to=2026-02-28");
    expect(bucketHref("2028-02", "month")).toBe("/admin/enquiries?from=2028-02-01&to=2028-02-29"); // leap year
    expect(bucketHref("2026-12", "month")).toBe("/admin/enquiries?from=2026-12-01&to=2026-12-31");
  });
});
