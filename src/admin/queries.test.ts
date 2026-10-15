// Pure proofs for the admin page's window selection and SQL construction (D11, T10, T12).
// No network involved: the builders are asserted against literal SQL fragments, and
// parseDays is asserted against literal inputs and outputs.
//
// The time-bound and day-bucketing constructs (toDateTime, formatDateTime) are not
// invented: they are the ones the old Nuxt implementation proves work against this same
// Analytics Engine SQL API — server/utils/query-filter.ts's appendTimeFilter for the
// `toDateTime(unixSeconds)` bound, server/api/stats/views.get.ts's query2sql for the
// `formatDateTime(timestamp, '%Y-%m-%d', 'Etc/UTC')` day bucket. `NOW() - INTERVAL` and
// `toStartOfInterval` are not demonstrated anywhere in this codebase and were dropped.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDailyClicksQuery,
  buildPerLinkQuery,
  buildTopCountriesQuery,
  buildTopMissingSlugsQuery,
  buildTopReferrersQuery,
  buildTotalsQuery,
  mergeHomeSlugRows,
  parseDays,
  runAnalyticsQuery,
  windowStart,
} from "./queries.ts";

describe("parseDays", () => {
  it.each([
    ["7", 7],
    ["30", 30],
    ["90", 90],
  ])("accepts the valid window %s", (input, expected) => {
    expect(parseDays(input)).toBe(expected);
  });

  it.each([
    [null, "no value at all"],
    ["", "an empty string"],
    ["15", "a window that is not offered"],
    ["-30", "a negative number"],
    ["abc", "text that is not a number"],
    ["7.5", "a non-integer"],
  ])("falls back to 30 for %s (%s)", (input, _description) => {
    expect(parseDays(input)).toBe(30);
  });
});

describe("windowStart", () => {
  it("anchors to UTC midnight of the day 'days - 1' calendar days before now, not a rolling instant", () => {
    // Worked by hand: 2024-01-10 minus 6 calendar days is 2024-01-04. A 7-day window
    // ending today therefore starts at 2024-01-04T00:00:00Z, not 7*24h before 14:32.
    const now = new Date("2024-01-10T14:32:00Z");
    expect(windowStart(7, now).toISOString()).toBe("2024-01-04T00:00:00.000Z");
  });

  it("starts on today itself for a non-midnight now, never in the future", () => {
    const now = new Date("2024-01-10T14:32:00Z");
    expect(windowStart(1, now).toISOString()).toBe("2024-01-10T00:00:00.000Z");
  });
});

describe("buildTotalsQuery", () => {
  it("bounds the window to a UTC-midnight instant, matching the old implementation's toDateTime(unixSeconds) construct", () => {
    const now = new Date("2024-01-10T14:32:00Z");
    // 2024-01-04T00:00:00Z in Unix seconds, computed independently of windowStart.
    const expectedSeconds = Date.UTC(2024, 0, 4, 0, 0, 0) / 1000;
    expect(buildTotalsQuery(7, now)).toContain(`toDateTime(${expectedSeconds})`);
  });

  it("does not use the unverified NOW() - INTERVAL construct", () => {
    expect(buildTotalsQuery(7)).not.toContain("INTERVAL");
    expect(buildTotalsQuery(7)).not.toContain("NOW()");
  });

  it("excludes miss events (double1 = 1) from the totals", () => {
    expect(buildTotalsQuery(30)).toContain("double1 = 0");
  });
});

describe("buildPerLinkQuery", () => {
  it("bounds the window to a UTC-midnight instant via toDateTime", () => {
    const now = new Date("2024-01-10T14:32:00Z");
    const expectedSeconds = Date.UTC(2024, 0, 4, 0, 0, 0) / 1000;
    expect(buildPerLinkQuery(7, now)).toContain(`toDateTime(${expectedSeconds})`);
  });

  it("excludes miss events (double1 = 1) from the per-link table", () => {
    expect(buildPerLinkQuery(30)).toContain("double1 = 0");
  });

  it("no longer excludes the home-page redirect from the per-link table", () => {
    expect(buildPerLinkQuery(30)).not.toContain("!= ''");
  });

  it("groups by the bare slug blob, not an expression — the live SQL API rejects a GROUP BY expression (422: 'you may only provide column names'), contradicting Cloudflare's own docs, which say an expression is allowed", () => {
    const sql = buildPerLinkQuery(30);
    expect(sql).toContain("blob1 AS slug");
    expect(sql).toContain("GROUP BY blob1");
    expect(sql).not.toContain("if(");
  });

  it("orders by clicks descending", () => {
    expect(buildPerLinkQuery(30)).toContain("ORDER BY clicks DESC");
  });
});

describe("mergeHomeSlugRows", () => {
  it("maps an empty slug to '/'", () => {
    expect(mergeHomeSlugRows([{ slug: "", clicks: 5 }])).toEqual([{ slug: "/", clicks: 5 }]);
  });

  it("sums an empty-slug row and a genuine '/' row into one row, rather than renaming one over the other", () => {
    // Both can be present in the same result set: legacy rows written before the home
    // redirect indexed itself as '/' carry an empty slug, and Analytics Engine's
    // three-month retention keeps them arriving until roughly December 2026. A rename
    // would leave two '/' rows; the fix must merge them into one.
    const merged = mergeHomeSlugRows([
      { slug: "", clicks: 3 },
      { slug: "/", clicks: 4 },
    ]);
    expect(merged).toEqual([{ slug: "/", clicks: 7 }]);
  });

  it("re-sorts by clicks descending after merging, since the merged row's total may now outrank rows that led before the merge", () => {
    const merged = mergeHomeSlugRows([
      { slug: "foo", clicks: 6 },
      { slug: "", clicks: 3 },
      { slug: "/", clicks: 4 },
    ]);
    expect(merged).toEqual([
      { slug: "/", clicks: 7 },
      { slug: "foo", clicks: 6 },
    ]);
  });

  it("leaves other rows untouched", () => {
    expect(mergeHomeSlugRows([{ slug: "foo", clicks: 2 }])).toEqual([{ slug: "foo", clicks: 2 }]);
  });
});

describe("buildTopCountriesQuery", () => {
  it("bounds the window to a UTC-midnight instant via toDateTime", () => {
    const now = new Date("2024-01-10T14:32:00Z");
    const expectedSeconds = Date.UTC(2024, 0, 4, 0, 0, 0) / 1000;
    expect(buildTopCountriesQuery(7, now)).toContain(`toDateTime(${expectedSeconds})`);
  });

  it("excludes miss events (double1 = 1) from the country counts", () => {
    expect(buildTopCountriesQuery(30)).toContain("double1 = 0");
  });

  it("groups by the country blob", () => {
    expect(buildTopCountriesQuery(30)).toContain("blob4 AS country");
    expect(buildTopCountriesQuery(30)).toContain("GROUP BY blob4");
  });

  it("orders by clicks descending, limited to the top 10", () => {
    expect(buildTopCountriesQuery(30)).toContain("ORDER BY clicks DESC LIMIT 10");
  });
});

describe("buildTopReferrersQuery", () => {
  it("bounds the window to a UTC-midnight instant via toDateTime", () => {
    const now = new Date("2024-01-10T14:32:00Z");
    const expectedSeconds = Date.UTC(2024, 0, 4, 0, 0, 0) / 1000;
    expect(buildTopReferrersQuery(7, now)).toContain(`toDateTime(${expectedSeconds})`);
  });

  it("excludes miss events (double1 = 1) from the referrer counts", () => {
    expect(buildTopReferrersQuery(30)).toContain("double1 = 0");
  });

  it("groups by the referer blob", () => {
    expect(buildTopReferrersQuery(30)).toContain("blob3 AS referrer");
    expect(buildTopReferrersQuery(30)).toContain("GROUP BY blob3");
  });

  it("orders by clicks descending, limited to the top 10", () => {
    expect(buildTopReferrersQuery(30)).toContain("ORDER BY clicks DESC LIMIT 10");
  });
});

describe("buildDailyClicksQuery", () => {
  it("bounds the window to a UTC-midnight instant via toDateTime", () => {
    const now = new Date("2024-01-10T14:32:00Z");
    const expectedSeconds = Date.UTC(2024, 0, 4, 0, 0, 0) / 1000;
    expect(buildDailyClicksQuery(7, now)).toContain(`toDateTime(${expectedSeconds})`);
  });

  it("buckets by calendar day using the old implementation's formatDateTime construct, not toStartOfInterval", () => {
    expect(buildDailyClicksQuery(30)).toContain(
      "formatDateTime(timestamp, '%Y-%m-%d', 'Etc/UTC') AS day",
    );
    expect(buildDailyClicksQuery(30)).not.toContain("toStartOfInterval");
  });

  it("excludes miss events (double1 = 1) from the daily series", () => {
    expect(buildDailyClicksQuery(30)).toContain("double1 = 0");
  });

  it("groups and orders by day", () => {
    expect(buildDailyClicksQuery(30)).toContain("GROUP BY day");
    expect(buildDailyClicksQuery(30)).toContain("ORDER BY day ASC");
  });
});

describe("runAnalyticsQuery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Stubs global fetch to answer the SQL API with the given body, matching the real endpoint's success shape. */
  function stubSqlApi(data: unknown[]): void {
    vi.stubGlobal("fetch", async () => Response.json({ data }));
  }

  it("coerces the numeric fields (clicks, visitors, misses) the live Analytics Engine SQL API returns as strings into real numbers", async () => {
    // The live API returns COUNT() and COUNT(DISTINCT ...) as JSON strings, not numbers
    // (observed live: the per-link table rendered "0131 0%" for a slug with 131 clicks,
    // the leading zero being `0 + "131"` string concatenation). No CF_API_TOKEN is
    // available in this sandbox to re-run `pnpm check:sql` against the live endpoint, so
    // this fixture is built from that observed output rather than a fresh live response.
    stubSqlApi([{ slug: "foo", clicks: "131", visitors: "9" }]);

    const rows = await runAnalyticsQuery<{ slug: string; clicks: number; visitors: number }>(
      { CF_API_TOKEN: "test-token" },
      "SELECT ...",
    );

    expect(rows).toEqual([{ slug: "foo", clicks: 131, visitors: 9 }]);
  });

  it("still accepts a numeric-fixture row, for a response shape the API does not currently send but should not break against", async () => {
    stubSqlApi([{ slug: "foo", clicks: 131, visitors: 9 }]);

    const rows = await runAnalyticsQuery<{ slug: string; clicks: number; visitors: number }>(
      { CF_API_TOKEN: "test-token" },
      "SELECT ...",
    );

    expect(rows).toEqual([{ slug: "foo", clicks: 131, visitors: 9 }]);
  });

  it("coerces a null or non-finite numeric field to 0 rather than NaN, and does not throw", async () => {
    stubSqlApi([
      { slug: "a", clicks: null },
      { slug: "b", clicks: "not-a-number" },
    ]);

    const rows = await runAnalyticsQuery<{ slug: string; clicks: number }>(
      { CF_API_TOKEN: "test-token" },
      "SELECT ...",
    );

    expect(rows).toEqual([
      { slug: "a", clicks: 0 },
      { slug: "b", clicks: 0 },
    ]);
  });

  it("leaves string fields such as day, slug, country and referrer untouched — day is a YYYY-MM-DD label, not a number", async () => {
    stubSqlApi([{ day: "2026-08-31", clicks: "5" }]);

    const rows = await runAnalyticsQuery<{ day: string; clicks: number }>(
      { CF_API_TOKEN: "test-token" },
      "SELECT ...",
    );

    expect(rows).toEqual([{ day: "2026-08-31", clicks: 5 }]);
  });
});

describe("buildTopMissingSlugsQuery", () => {
  it("bounds the window to a UTC-midnight instant via toDateTime", () => {
    const now = new Date("2024-01-10T14:32:00Z");
    const expectedSeconds = Date.UTC(2024, 0, 4, 0, 0, 0) / 1000;
    expect(buildTopMissingSlugsQuery(7, now)).toContain(`toDateTime(${expectedSeconds})`);
  });

  it("selects only miss events (double1 = 1), never hits", () => {
    expect(buildTopMissingSlugsQuery(30)).toContain("double1 = 1");
    expect(buildTopMissingSlugsQuery(30)).not.toContain("double1 = 0");
  });

  it("excludes the empty-slug home-page redirect", () => {
    expect(buildTopMissingSlugsQuery(30)).toContain("blob1 != ''");
  });

  it("groups by the slug blob", () => {
    expect(buildTopMissingSlugsQuery(30)).toContain("blob1 AS slug");
    expect(buildTopMissingSlugsQuery(30)).toContain("GROUP BY blob1");
  });

  it("orders by misses descending, limited to the top 10", () => {
    expect(buildTopMissingSlugsQuery(30)).toContain("ORDER BY misses DESC LIMIT 10");
  });
});
