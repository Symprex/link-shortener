// Pure proofs for the clicks-over-time chart (D6, T12): gap-filling a daily series and
// rendering it as an inline SVG. No fetch here — buildDailyClicksQuery's SQL is
// queries.test.ts's proof, and the wiring into the page is page.test.ts's.
import { describe, expect, it } from "vitest";
import { fillDailySeries, renderClicksChart } from "./chart.ts";
import { buildDailyClicksQuery } from "./queries.ts";

describe("fillDailySeries", () => {
  it("produces one point per day in the window, in chronological order", () => {
    const now = new Date("2026-09-01T12:00:00Z");
    const rows = [
      { day: "2026-08-30", clicks: 5 },
      { day: "2026-08-26", clicks: 2 },
    ];

    const points = fillDailySeries(rows, 7, now);

    // Worked by hand: a 7-day window ending 2026-09-01 covers 08-26 through 09-01.
    expect(points.map((point) => point.date)).toEqual([
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
    ]);
  });

  it("renders a gap day — one Analytics Engine returned no row for — as zero, not skipped", () => {
    const now = new Date("2026-09-01T12:00:00Z");
    const rows = [{ day: "2026-08-30", clicks: 5 }];

    const points = fillDailySeries(rows, 7, now);
    const gapDay = points.find((point) => point.date === "2026-08-28");

    expect(gapDay).toEqual({ date: "2026-08-28", clicks: 0 });
  });

  it.each([
    [7, 7],
    [30, 30],
    [90, 90],
  ])("returns %s points for the %s-day window", (days, expectedCount) => {
    const points = fillDailySeries([], days as 7 | 30 | 90, new Date("2026-09-01T00:00:00Z"));
    expect(points).toHaveLength(expectedCount);
  });

  it("sums multiple rows landing on the same calendar day", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    const rows = [
      { day: "2026-09-01", clicks: 3 },
      { day: "2026-09-01", clicks: 4 },
    ];

    const points = fillDailySeries(rows, 7, now);
    const today = points.find((point) => point.date === "2026-09-01");

    expect(today?.clicks).toBe(7);
  });

  it("starts the window at the same instant buildDailyClicksQuery bounds its SQL to, at a non-midnight now, so no row lands on a day the series has no bucket for", () => {
    // T12 must-fix: a rolling "now minus N*24h" bound and a calendar-day bucket list
    // disagree at every hour but midnight — the query would return a partial extra day
    // that fillDailySeries silently drops. Both sides must derive from windowStart.
    const now = new Date("2026-09-01T14:32:00Z");
    const days = 7;

    const sql = buildDailyClicksQuery(days, now);
    const points = fillDailySeries([], days, now);

    // 2026-09-01 minus 6 calendar days is 2026-08-26, worked by hand, independently of
    // both windowStart and fillDailySeries.
    const expectedBoundSeconds = Date.UTC(2026, 7, 26, 0, 0, 0) / 1000;
    expect(sql).toContain(`toDateTime(${expectedBoundSeconds})`);
    // The query's earliest included instant, read back as a calendar day, is exactly the
    // first bucket the series builds — no row the query could return falls outside it.
    expect(points[0]?.date).toBe("2026-08-26");
  });
});

describe("renderClicksChart", () => {
  it("plots one point per day and labels each with its date and count", () => {
    const svg = renderClicksChart([
      { date: "2026-08-31", clicks: 3 },
      { date: "2026-09-01", clicks: 0 },
    ]);

    expect(svg).toContain("2026-08-31: 3");
    expect(svg).toContain("2026-09-01: 0");
  });

  it("does not divide by zero for an all-zero series", () => {
    const svg = renderClicksChart([
      { date: "2026-08-31", clicks: 0 },
      { date: "2026-09-01", clicks: 0 },
    ]);

    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("does not divide by zero for a single-day series", () => {
    const svg = renderClicksChart([{ date: "2026-09-01", clicks: 4 }]);

    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(svg).toContain("2026-09-01: 4");
  });

  it("gives the SVG an accessible title and a scalable viewBox", () => {
    const svg = renderClicksChart([{ date: "2026-09-01", clicks: 1 }]);

    expect(svg).toMatch(/<svg[^>]*viewBox="[^"]+"/);
    expect(svg).toMatch(/<svg[^>]*preserveAspectRatio="[^"]+"/);
    expect(svg).toContain("<title");
  });

  it("escapes a hostile date value rather than rendering it", () => {
    const svg = renderClicksChart([{ date: "<script>alert(1)</script>", clicks: 1 }]);

    expect(svg).not.toContain("<script>alert(1)</script>");
    expect(svg).toContain("&lt;script&gt;");
  });
});
