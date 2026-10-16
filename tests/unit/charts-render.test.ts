import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { BarList, ChangeNote, ColumnChart, TrendChart } = await import("@/components/admin/charts");
const { Sparkline, Stat } = await import("@/components/admin/ui");

const render = <P extends object>(el: (props: P) => React.ReactNode, props: P) => renderToStaticMarkup(createElement(el as React.FC<P>, props));
const day = (bucket: string, CONTACT: number, PACKAGE: number, CUSTOM_TRIP: number) => ({ bucket, total: CONTACT + PACKAGE + CUSTOM_TRIP, byType: { CONTACT, PACKAGE, CUSTOM_TRIP } });
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("TrendChart", () => {
  const data = [day("2026-10-14", 1, 0, 0), day("2026-10-15", 0, 2, 1), day("2026-10-16", 1, 0, 0)];
  const previous = [{ bucket: "2026-10-11", total: 2 }, { bucket: "2026-10-12", total: 0 }, { bucket: "2026-10-13", total: 2 }];

  it("summarises the period from the data it is given", () => {
    const html = render(TrendChart, { data, previous, unit: "day", label: "Enquiries per day", periodLabel: "3 days" });
    expect(html).toMatch(/data-testid="trend-total"[^>]*>5</);
    expect(html).toMatch(/data-testid="trend-average"[^>]*>1\.7</);
    expect(text(html)).toContain("3 on 15 Oct");
    expect(text(html)).toContain("25% up on previous 3 days"); // 5 vs 4
    expect(html).toContain('data-change="25"');
  });

  it("is a labelled, keyboard-focusable chart with one data line and an end label", () => {
    const html = render(TrendChart, { data, previous, unit: "day", label: "Enquiries per day", periodLabel: "3 days" });
    expect(html).toContain('data-chart="trend"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("Enquiries per day. 5 enquiries in total. Use the arrow keys");
    expect(html.match(/data-series="total"/g)).toHaveLength(1);
    expect(html).not.toContain('data-series="previous"'); // comparison is off until asked for
    expect(html).toMatch(/aria-pressed="true"[^>]*>Total</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>By type</);
    expect(html).toContain("Compare with previous 3 days");
    expect(html).toContain("Show table");
  });

  it("shows the empty state only when there is nothing in either period", () => {
    const zero = data.map((d) => day(d.bucket, 0, 0, 0));
    expect(render(TrendChart, { data: zero, previous: previous.map((p) => ({ ...p, total: 0 })), unit: "day", label: "L", periodLabel: "3 days" })).toContain('data-chart="empty"');
    // A quiet period after a busy one is still drawn, so the drop is visible.
    const quiet = render(TrendChart, { data: zero, previous, unit: "day", label: "L", periodLabel: "3 days" });
    expect(quiet).toContain('data-chart="trend"');
    expect(text(quiet)).toContain("100% down on previous 3 days");
  });

  it("labels monthly buckets", () => {
    const months = [day("2026-09", 2, 0, 0), day("2026-10", 1, 0, 0)];
    const html = render(TrendChart, { data: months, previous: [{ bucket: "2025-09", total: 0 }, { bucket: "2025-10", total: 0 }], unit: "month", label: "L", periodLabel: "12 months" });
    expect(text(html)).toContain("Average per month");
    expect(text(html)).toContain("Sept 2026");
    expect(text(html)).toContain("new this period (0 in previous 12 months)");
  });
});

describe("BarList", () => {
  const data = [{ label: "New", count: 6, href: "/admin/enquiries?status=NEW" }, { label: "Closed", count: 3 }, { label: "Spam", count: 1 }];

  it("draws bars proportional to the largest value with counts, shares and links", () => {
    const html = render(BarList, { data, label: "By status", unitLabel: "Enquiries", emptyMessage: "None" });
    expect(html.match(/data-bar-width="([\d.]+)"/g)).toEqual(['data-bar-width="100.0"', 'data-bar-width="50.0"', 'data-bar-width="16.7"']);
    expect(html).toContain('aria-label="New: 6 enquiries, 60% of 10"');
    expect(html).toContain('aria-label="Spam: 1 enquiries, 10% of 10"');
    expect(html).toContain('href="/admin/enquiries?status=NEW"');
    expect(html.match(/data-value="(\d+)"/g)).toEqual(['data-value="6"', 'data-value="3"', 'data-value="1"']);
  });

  it("uses an explicit total for shares when given", () => {
    expect(render(BarList, { data, label: "L", unitLabel: "Enquiries", emptyMessage: "None", total: 20 })).toContain("New: 6 enquiries, 30% of 20");
  });

  it("shows the empty state for no data or all zeros", () => {
    expect(render(BarList, { data: [], label: "L", unitLabel: "U", emptyMessage: "Nothing here" })).toContain("Nothing here");
    expect(render(BarList, { data: [{ label: "A", count: 0 }], label: "L", unitLabel: "U", emptyMessage: "Nothing here" })).toContain('data-chart="empty"');
  });
});

describe("ColumnChart", () => {
  const week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  it("labels the busiest day and gives every column a focusable, labelled value", () => {
    const data = week.map((label, i) => ({ label, count: [1, 0, 2, 0, 5, 1, 1][i]! }));
    const html = render(ColumnChart, { data, label: "By weekday", unitLabel: "Enquiries", emptyMessage: "None" });
    expect(text(html)).toContain("Busiest: Fri , 5 of 10 (50%)");
    expect(html.match(/<li tabindex="0"/g)).toHaveLength(7);
    expect(html).toContain('aria-label="Fri: 5 enquiries, 50%"');
    expect(html).toContain('aria-label="Tue: 0 enquiries, 0%"');
  });
  it("reports ties honestly and handles an empty week", () => {
    const tied = week.map((label, i) => ({ label, count: i < 2 ? 3 : 0 }));
    expect(text(render(ColumnChart, { data: tied, label: "L", unitLabel: "U", emptyMessage: "None" }))).toContain("Busiest: 2 days tied at 3");
    expect(render(ColumnChart, { data: week.map((label) => ({ label, count: 0 })), label: "L", unitLabel: "U", emptyMessage: "No enquiries" })).toContain('data-chart="empty"');
  });
});

describe("KPI tile parts", () => {
  it("ChangeNote uses words and an icon, never colour alone", () => {
    expect(text(render(ChangeNote, { current: 6, previous: 4, periodLabel: "7 days" }))).toContain("50% up on previous 7 days");
    expect(text(render(ChangeNote, { current: 2, previous: 4, periodLabel: "7 days" }))).toContain("50% down on previous 7 days");
    expect(text(render(ChangeNote, { current: 4, previous: 4, periodLabel: "7 days" }))).toContain("same as previous 7 days");
    expect(text(render(ChangeNote, { current: 0, previous: 0, periodLabel: "7 days" }))).toContain("none in either period");
    expect(render(ChangeNote, { current: 6, previous: 4, periodLabel: "7 days" })).toContain("<svg");
  });
  it("Sparkline is decorative and needs at least two points", () => {
    const html = render(Sparkline, { values: [0, 2, 1] });
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("data-sparkline");
    expect(render(Sparkline, { values: [3] })).toBe("");
  });
  it("Stat shows the figure with its optional sparkline and footer", () => {
    const html = render(Stat, { label: "Received", value: 5, testId: "kpi", spark: [1, 2], footer: createElement("span", null, "footnote") });
    expect(html).toMatch(/data-testid="kpi"[^>]*>5</);
    expect(html).toContain("data-sparkline");
    expect(html).toContain("footnote");
  });
});
