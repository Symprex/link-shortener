// Proves the admin page's rendering contract (T10, T11, T12): totals, a per-link table
// sorted by clicks, a 7/30/90 window selector as plain links, the clicks-per-day chart,
// and — per the spec's edge cases — an inline error notice rather than a 500 or a blank
// page when the Analytics Engine query fails. Driven directly at renderAdminPage() rather
// than through SELF.fetch(): the Access gate in front of the admin Worker is proved in
// src/admin/index.test.ts, not here.
//
// globalThis.fetch is stubbed for the SQL API endpoint — the real network is never
// touched.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderAdminPage } from "./page.ts";

const ENV = { CF_API_TOKEN: "test-token" };
const SQL_API_URL =
  "https://api.cloudflare.com/client/v4/accounts/93686db668e1fd06177661df08f7c0cd/analytics_engine/sql";

/** What the stubbed fetch answers the SQL API with, per test — set before each call. */
let sqlHandler: (body: string) => Response | Promise<Response>;

beforeEach(() => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    expect(url).toBe(SQL_API_URL);
    return sqlHandler(String(init?.body ?? ""));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function url(query = ""): URL {
  return new URL(`https://go.symprex.com/admin${query}`);
}

/** A fixed instant for the tests that need to pass a later argument past `now`. */
const NOW = new Date("2026-09-01T00:00:00Z");

/** Every kind of query queries.ts's builders can produce, keyed by its distinguishing SQL fragment. */
type QueryKind = "totals" | "perLink" | "missingSlugs" | "countries" | "referrers" | "dailyClicks";

function classifySql(sql: string): QueryKind {
  if (sql.includes("AS slug") && sql.includes("double1 = 0")) return "perLink";
  if (sql.includes("blob1 AS slug") && sql.includes("double1 = 1")) return "missingSlugs";
  if (sql.includes("blob4 AS country")) return "countries";
  if (sql.includes("blob3 AS referrer")) return "referrers";
  if (sql.includes("AS day")) return "dailyClicks";
  if (sql.includes("COUNT(DISTINCT blob2)")) return "totals";
  throw new Error(`routeSql does not recognise this query, add a QueryKind for it: ${sql}`);
}

type SqlResponder = (sql: string) => Response | Promise<Response>;

// The live Analytics Engine SQL API returns COUNT() and COUNT(DISTINCT ...) as JSON
// strings, not numbers (observed live: the per-link table rendered "0131 0%" for a slug
// with 131 clicks, and the totals/percentage math this file's tests exercise silently did
// string concatenation on them). The default responder below is deliberately
// string-shaped so a test that does not override a section still exercises the real API
// shape, rather than the numeric fixture that let this bug reach the deployed page
// unnoticed the first time.
const DEFAULT_RESPONDERS: Record<QueryKind, SqlResponder> = {
  totals: () => Response.json({ data: [{ clicks: "1", visitors: "1" }] }),
  perLink: () => Response.json({ data: [] }),
  missingSlugs: () => Response.json({ data: [] }),
  countries: () => Response.json({ data: [] }),
  referrers: () => Response.json({ data: [] }),
  dailyClicks: () => Response.json({ data: [] }),
};

/**
 * Builds a stubbed SQL API handler for one test: routes each query to its kind by the same
 * distinguishing SQL fragment queries.ts's builders are proven (queries.test.ts) to emit,
 * defaults a kind a test does not override to an empty result, and — this routing broke
 * silently three times by handing an unmatched query a wrong-shaped response via a generic
 * `GROUP BY` catch-all — throws loudly instead when a query cannot be classified, so the
 * next query this file adds cannot repeat it.
 */
function routeSql(overrides: Partial<Record<QueryKind, SqlResponder>> = {}): SqlResponder {
  return (sql) => {
    const kind = classifySql(sql);
    const responder = overrides[kind] ?? DEFAULT_RESPONDERS[kind];
    return responder(sql);
  };
}

describe("renderAdminPage", () => {
  it("renders totals and a per-link table sorted by clicks descending", async () => {
    sqlHandler = routeSql({
      totals: () => Response.json({ data: [{ clicks: 11, visitors: 4 }] }),
      perLink: () =>
        Response.json({
          data: [
            { slug: "bar", clicks: 2 },
            { slug: "foo", clicks: 9 },
          ],
        }),
    });

    const response = await renderAdminPage(ENV, url());
    expect(response.status).toBe(200);
    const body = await response.text();

    expect(body).toContain("11");
    expect(body).toContain("4");

    const fooIndex = body.indexOf("foo");
    const barIndex = body.indexOf("bar");
    expect(fooIndex).toBeGreaterThan(-1);
    expect(barIndex).toBeGreaterThan(fooIndex);
  });

  it("renders no blank row for a single per-link result", async () => {
    sqlHandler = routeSql({
      perLink: () => Response.json({ data: [{ slug: "foo", clicks: 1 }] }),
    });

    const response = await renderAdminPage(ENV, url());
    const body = await response.text();
    // buildPerLinkQuery coalesces an empty-string slug to '/' (queries.test.ts), so '/' is
    // a genuine row rather than the blank one this used to guard against; this now just
    // proves rendering a single row does not introduce a blank <td> of its own.
    expect(body).not.toMatch(/<td>\s*<\/td>/);
  });

  it("escapes a slug containing markup rather than rendering it", async () => {
    sqlHandler = routeSql({
      perLink: () => Response.json({ data: [{ slug: "<script>alert(1)</script>", clicks: 1 }] }),
    });

    const response = await renderAdminPage(ENV, url());
    const body = await response.text();
    expect(body).not.toContain("<script>alert(1)</script>");
    expect(body).toContain("&lt;script&gt;");
  });

  it("renders '/' as a genuine row in the per-link table, counted toward active links, with totals equal to the sum of the table", async () => {
    sqlHandler = routeSql({
      totals: () => Response.json({ data: [{ clicks: 5, visitors: 2 }] }),
      perLink: () =>
        Response.json({
          data: [
            { slug: "/", clicks: 3 },
            { slug: "foo", clicks: 2 },
          ],
        }),
    });

    const response = await renderAdminPage(ENV, url());
    const body = await response.text();

    // 3 of (3 + 2) is 60%, 2 of (3 + 2) is 40%, worked by hand from the fixture above —
    // the per-link table's own total, not the page-wide clicks total.
    expect(body).toContain(
      '<tr><td>/<div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width: 60%"></div></div></td><td>3 <span class="pct">60%</span></td></tr>',
    );
    expect(body).toContain(
      '<tr><td>foo<div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width: 40%"></div></div></td><td>2 <span class="pct">40%</span></td></tr>',
    );
    // Totals (5) equal the sum of the per-link rows (3 + 2), worked by hand from the
    // fixture above — no longer the footnoted discrepancy the empty-slug exclusion caused.
    expect(body).toContain("Clicks: <strong>5</strong>");
    expect(body).toContain("Active links: <strong>2</strong>");
  });

  it("renders string-shaped click counts from the live API correctly, not as leading-zero concatenation", async () => {
    // The API sends COUNT() as a JSON string. Before the fix, mergeHomeSlugRows summed
    // these with `(clicksBySlug.get(slug) ?? 0) + row.clicks`, which is `0 + "131"` —
    // string concatenation, not addition — rendering "0131" instead of "131", and the
    // percentage denominator concatenated every count into one string, rounding every
    // row's share to 0%. Percentages worked by hand, independently of the implementation:
    // total is 131 + 41 + 11 + 9 = 192; 131/192 is 68.23% (rounds to 68), 41/192 is
    // 21.35% (rounds to 21), 11/192 is 5.73% (rounds to 6), 9/192 is 4.69% (rounds to 5).
    sqlHandler = routeSql({
      totals: () => Response.json({ data: [{ clicks: "192", visitors: "2" }] }),
      perLink: () =>
        Response.json({
          data: [
            { slug: "a", clicks: "131" },
            { slug: "b", clicks: "41" },
            { slug: "c", clicks: "11" },
            { slug: "d", clicks: "9" },
          ],
        }),
    });

    const response = await renderAdminPage(ENV, url());
    const body = await response.text();

    expect(body).toContain('<td>131 <span class="pct">68%</span></td>');
    expect(body).toContain('<td>41 <span class="pct">21%</span></td>');
    expect(body).toContain('<td>11 <span class="pct">6%</span></td>');
    expect(body).toContain('<td>9 <span class="pct">5%</span></td>');
    expect(body).not.toMatch(/<td>0\d+/);
    expect(body).toContain("Clicks: <strong>192</strong>");
    expect(body).not.toContain("NaN");
    expect(body).not.toContain("Infinity");
  });

  it("renders no percentage bar row and no NaN/Infinity for an empty per-link table", async () => {
    sqlHandler = routeSql({
      perLink: () => Response.json({ data: [] }),
    });

    const response = await renderAdminPage(ENV, url());
    const body = await response.text();
    expect(body).not.toContain("NaN");
    expect(body).not.toContain("Infinity");
  });

  it("gives a lone per-link row a full-width 100% bar rather than dividing by a page-wide total", async () => {
    sqlHandler = routeSql({
      totals: () => Response.json({ data: [{ clicks: 40, visitors: 1 }] }),
      perLink: () => Response.json({ data: [{ slug: "foo", clicks: 9 }] }),
    });

    const response = await renderAdminPage(ENV, url());
    const body = await response.text();
    // foo is the only row in its own table, so it is 100% of that table's total (9 of 9)
    // even though the page-wide total is 40 — the denominator is the table's own sum.
    expect(body).toContain('style="width: 100%"');
    expect(body).toContain('<span class="pct">100%</span>');
  });

  it.each([
    ["7", "days=7"],
    ["90", "days=90"],
  ])("renders the %s-day window selector as a plain link", async (_name, expectedQuery) => {
    sqlHandler = routeSql();
    const response = await renderAdminPage(ENV, url());
    const body = await response.text();
    expect(body).toContain(`?${expectedQuery}`);
  });

  it("falls back to the 30-day window for an invalid days value", async () => {
    // A deliberately unrealistic year, not just a non-midnight time: if renderAdminPage
    // ignored the injected `now` and fell back to the real clock, this date would make
    // that obvious rather than passing by coincidence.
    const now = new Date("2019-03-15T00:00:00Z");
    let totalsSql = "";
    sqlHandler = routeSql({
      totals: (sql) => {
        totalsSql = sql;
        return Response.json({ data: [] });
      },
    });

    await renderAdminPage(ENV, url("?days=15"), now);

    // 2019-03-15 minus 29 calendar days is 2019-02-14, worked by hand: a 30-day window
    // bounds to UTC midnight on the 30th day counting back from and including today.
    const expectedBoundSeconds = Date.UTC(2019, 1, 14, 0, 0, 0) / 1000;
    expect(totalsSql).toContain(`toDateTime(${expectedBoundSeconds})`);
  });

  it("renders an inline error notice, not a 500, when the query fails", async () => {
    sqlHandler = () => new Response("nope", { status: 500 });

    const response = await renderAdminPage(ENV, url());
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body.toLowerCase()).toContain("error");
  });

  it("renders an inline error notice when the query throws outright", async () => {
    sqlHandler = () => {
      throw new Error("network is down");
    };

    const response = await renderAdminPage(ENV, url());
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body.toLowerCase()).toContain("error");
  });

  it("renders the top countries and top referrers, sorted by clicks descending", async () => {
    sqlHandler = routeSql({
      countries: () =>
        Response.json({
          data: [
            { country: "US", clicks: 9 },
            { country: "GB", clicks: 2 },
          ],
        }),
      referrers: () =>
        Response.json({
          data: [
            { referrer: "https://example.com", clicks: 7 },
            { referrer: "https://other.example.com", clicks: 1 },
          ],
        }),
    });

    const response = await renderAdminPage(ENV, url());
    const body = await response.text();

    const usIndex = body.indexOf("US");
    const gbIndex = body.indexOf("GB");
    expect(usIndex).toBeGreaterThan(-1);
    expect(gbIndex).toBeGreaterThan(usIndex);

    const exampleIndex = body.indexOf("https://example.com");
    const otherIndex = body.indexOf("https://other.example.com");
    expect(exampleIndex).toBeGreaterThan(-1);
    expect(otherIndex).toBeGreaterThan(exampleIndex);
  });

  it("relabels the '-' placeholder as unknown for a missing country and none for a missing referrer", async () => {
    sqlHandler = routeSql({
      countries: () => Response.json({ data: [{ country: "-", clicks: 3 }] }),
      referrers: () => Response.json({ data: [{ referrer: "-", clicks: 3 }] }),
    });

    const response = await renderAdminPage(ENV, url());
    const body = await response.text();

    expect(body).toContain("(unknown)");
    expect(body).toContain("(none)");
    expect(body).not.toMatch(/<td>-<\/td>/);
  });

  it("renders a country row as an uppercase code badge followed by the full name from Intl.DisplayNames", async () => {
    sqlHandler = routeSql({
      countries: () => Response.json({ data: [{ country: "GB", clicks: 1 }] }),
    });

    const response = await renderAdminPage(ENV, url());
    const body = await response.text();
    // "GB" -> "United Kingdom" is verified against this repo's own workerd runtime
    // (task instructions), not re-derived from the implementation under test.
    expect(body).toContain('<span class="country-badge">GB</span>');
    expect(body).toContain("United Kingdom");
  });

  it("falls back to showing just the code for a malformed country code, without throwing", async () => {
    sqlHandler = routeSql({
      countries: () => Response.json({ data: [{ country: "XYZ", clicks: 1 }] }),
    });

    // Intl.DisplayNames#of throws RangeError on a three-letter region code (verified by
    // hand against the platform's Intl implementation) — this proves the page catches it
    // rather than surfacing a 500 or the literal string "undefined".
    const response = await renderAdminPage(ENV, url());
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("undefined");
    expect(body).toContain('<span class="country-badge">XYZ</span>');
  });

  it("never passes the '-' placeholder to Intl.DisplayNames — it renders unknown before any lookup", async () => {
    sqlHandler = routeSql({
      countries: () => Response.json({ data: [{ country: "-", clicks: 1 }] }),
    });

    const response = await renderAdminPage(ENV, url());
    const body = await response.text();
    // '-' is one character, which Intl.DisplayNames#of throws RangeError on rather than
    // returning a name for (verified by hand): if the placeholder reached .of() instead of
    // being relabelled first, the page would 500 rather than showing "(unknown)".
    expect(response.status).toBe(200);
    expect(body).toContain("(unknown)");
  });

  it("renders the top missing slugs from the miss events, separately from the per-link hits", async () => {
    sqlHandler = routeSql({
      missingSlugs: () =>
        Response.json({
          data: [
            { slug: "typo-slug", misses: 5 },
            { slug: "old-slug", misses: 1 },
          ],
        }),
    });

    const response = await renderAdminPage(ENV, url());
    const body = await response.text();

    const typoIndex = body.indexOf("typo-slug");
    const oldIndex = body.indexOf("old-slug");
    expect(typoIndex).toBeGreaterThan(-1);
    expect(oldIndex).toBeGreaterThan(typoIndex);
  });

  it("shows each of the four ranked tables' own share of clicks as a percentage bar, not a page-wide share", async () => {
    sqlHandler = routeSql({
      countries: () =>
        Response.json({
          data: [
            { country: "US", clicks: 3 },
            { country: "GB", clicks: 1 },
          ],
        }),
      referrers: () =>
        Response.json({
          data: [
            { referrer: "https://example.com", clicks: 3 },
            { referrer: "https://other.example.com", clicks: 1 },
          ],
        }),
      missingSlugs: () =>
        Response.json({
          data: [
            { slug: "typo-slug", misses: 3 },
            { slug: "old-slug", misses: 1 },
          ],
        }),
    });

    const response = await renderAdminPage(ENV, url());
    const body = await response.text();

    // Each table's own total is 3 + 1 = 4, worked by hand: 3 of 4 is 75%, 1 of 4 is 25%.
    // Three tables here (countries, referrers, missing slugs), so this string appears
    // three times across the page.
    expect(body.match(/style="width: 75%"/g)).toHaveLength(3);
    expect(body.match(/style="width: 25%"/g)).toHaveLength(3);
  });

  it("gives an all-zero table 0% bars for every row rather than NaN", async () => {
    sqlHandler = routeSql({
      countries: () =>
        Response.json({
          data: [
            { country: "US", clicks: 0 },
            { country: "GB", clicks: 0 },
          ],
        }),
    });

    const response = await renderAdminPage(ENV, url());
    const body = await response.text();
    expect(body).not.toContain("NaN");
    expect(body).not.toContain("Infinity");
    expect(body.match(/style="width: 0%"/g)).toHaveLength(2);
  });

  it("escapes a hostile referer value rather than rendering it", async () => {
    sqlHandler = routeSql({
      referrers: () =>
        Response.json({ data: [{ referrer: "<script>alert(1)</script>", clicks: 1 }] }),
    });

    const response = await renderAdminPage(ENV, url());
    const body = await response.text();
    expect(body).not.toContain("<script>alert(1)</script>");
    expect(body).toContain("&lt;script&gt;");
  });

  it("draws sane chart coordinates for string-shaped click counts from the live API, summing same-day rows rather than concatenating them", async () => {
    // The live API returns COUNT() as a JSON string. Before the T13 fix, fillDailySeries's
    // `(clicksByDate.get(row.day) ?? 0) + row.clicks` would concatenate two rows landing on
    // the same day ("3" + "4" -> "34") rather than sum them (7), and renderClicksChart's
    // SVG coordinates would inherit whatever that produced.
    const now = new Date("2026-09-01T00:00:00Z");
    sqlHandler = routeSql({
      dailyClicks: () =>
        Response.json({
          data: [
            { day: "2026-09-01", clicks: "3" },
            { day: "2026-09-01", clicks: "4" },
          ],
        }),
    });

    const response = await renderAdminPage(ENV, url("?days=7"), now);
    const body = await response.text();

    // 3 and 4 summed is 7, worked by hand — the chart's tooltip for today's point.
    expect(body).toContain("2026-09-01: 7");
    expect(body).not.toContain("NaN");
    expect(body).not.toContain("Infinity");
  });

  it("draws the clicks-per-day chart as an inline SVG with one point per day in the window", async () => {
    const now = new Date("2026-09-01T00:00:00Z");
    sqlHandler = routeSql({
      dailyClicks: () => Response.json({ data: [{ day: "2026-08-31", clicks: 5 }] }),
    });

    const response = await renderAdminPage(ENV, url("?days=7"), now);
    const body = await response.text();

    expect(body).toContain("<svg");
    expect(body.match(/<circle/g)).toHaveLength(7);
  });

  it("renders an inline error notice scoped to the chart, not the whole page, when the daily-clicks query fails", async () => {
    sqlHandler = routeSql({
      dailyClicks: () => new Response("nope", { status: 500 }),
      perLink: () => Response.json({ data: [{ slug: "foo", clicks: 1 }] }),
    });

    const response = await renderAdminPage(ENV, url());
    expect(response.status).toBe(200);
    const body = await response.text();

    expect(body.toLowerCase()).toContain("error");
    expect(body).toContain("foo");
  });

  it("threads a single now instant through both the SQL bound and the chart buckets, so a row for the window's earliest day is never silently dropped", async () => {
    // T12 must-fix: at a non-midnight now, a SQL bound and a chart bucket list computed
    // from two different `new Date()` calls (or two different formulas) can disagree
    // about the window's edge day. renderAdminPage must derive both from one `now`. A
    // deliberately unrealistic year makes an unthreaded `now` (falling back to the real
    // clock) fail obviously rather than by coincidence.
    const now = new Date("2019-03-15T14:32:00Z");
    let dailyClicksSql = "";
    sqlHandler = routeSql({
      dailyClicks: (sql) => {
        dailyClicksSql = sql;
        return Response.json({ data: [] });
      },
    });

    const response = await renderAdminPage(ENV, url("?days=7"), now);
    const body = await response.text();

    // 2019-03-15 minus 6 calendar days is 2019-03-09, worked by hand.
    const expectedBoundSeconds = Date.UTC(2019, 2, 9, 0, 0, 0) / 1000;
    expect(dailyClicksSql).toContain(`toDateTime(${expectedBoundSeconds})`);
    // The chart's first bucket is that same calendar day — not one either side of it.
    expect(body).toContain("2019-03-09: 0");
  });

  it("titles the page Symprex Go, in both the <title> and the visible heading", async () => {
    sqlHandler = routeSql();
    const response = await renderAdminPage(ENV, url(), NOW);
    const body = await response.text();
    expect(body).toContain("<title>Symprex Go</title>");
    expect(body).toContain("<h1>Symprex Go</h1>");
  });

  it("declares the Signature365 tokens in both a light :root block and a dark prefers-color-scheme block", async () => {
    sqlHandler = routeSql();
    const response = await renderAdminPage(ENV, url(), NOW);
    const body = await response.text();

    // Light values, worked from the task's own token table rather than re-derived from
    // the implementation: the light declarations sit outside any media query.
    expect(body).toContain("--s-page-bg: #f9fafb");
    expect(body).toContain("--s-heading-color: #111827");
    expect(body).toContain("--sig365-theme-link-color: #1570cd");

    // The dark block is a real @media (prefers-color-scheme: dark) rule containing the
    // dark values from the same table — not just the string present anywhere in the page.
    const darkBlockMatch = body.match(
      /@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n\s{0,4}\}\s*(?=<\/style>|\n\s*(?:\.|:root|@media))/,
    );
    expect(darkBlockMatch).not.toBeNull();
    const darkBlock = darkBlockMatch?.[1] ?? "";
    expect(darkBlock).toContain("--s-page-bg: #0f1117");
    expect(darkBlock).toContain("--s-heading-color: #f9fafb");
    expect(darkBlock).toContain("--sig365-theme-link-color: #60a5fa");

    // Neither the light block (`:root:not([data-theme=dark])`) nor the dark block
    // (`:root:not([data-theme])`) matches a root carrying `data-theme="dark"` — that state
    // falls between the two, so every --s-* token would be undeclared rather than merely
    // reverted to Pico's palette, blanking body, .panel and the bars. It is safe today only
    // because this page never emits a `data-theme` attribute and has no client JavaScript
    // to add one. If a theme toggle is ever added, THEME_CSS's selectors must be revisited
    // together with whatever sets the attribute — do not just delete this assertion. (The
    // literal string "data-theme" legitimately appears inside THEME_CSS's own selectors, so
    // this checks the <html> tag specifically rather than the whole body.)
    expect(body).toMatch(/<html lang="en">/);
    expect(body).not.toMatch(/<html[^>]*\bdata-theme/);
  });

  it("colours the percentage bars with the Signature365 tokens, not Pico's own variables", async () => {
    sqlHandler = routeSql();
    const response = await renderAdminPage(ENV, url(), NOW);
    const body = await response.text();

    // The task's own diagnosis: --pico-primary and --pico-muted-border-color do not
    // resolve in the classless build's dark scope, which is what made the bars invisible.
    // Extracting our own <style> block (everything after Pico's CSS, found by the first
    // occurrence of our .bar-track rule) and asserting no var(--pico- reference remains in
    // it proves the fix rather than merely that the new tokens were added alongside the
    // old ones.
    const barTrackIndex = body.indexOf(".bar-track");
    expect(barTrackIndex).toBeGreaterThan(-1);
    // Pico and our CSS are now two separate <style> tags (see the test below), so the
    // close tag that ends *our* block is the first one after .bar-track, not the first
    // one in the document.
    const ourCss = body.slice(barTrackIndex, body.indexOf("</style>", barTrackIndex));
    expect(ourCss).not.toContain("var(--pico-");
    expect(ourCss).toMatch(/\.bar-track\s*\{[^}]*background:\s*var\(--s-border-color\)/);
    expect(ourCss).toMatch(/\.bar-fill\s*\{[^}]*background:\s*var\(--sig365-theme-link-color\)/);
  });

  it("keeps Pico's CSS and our own CSS in separate <style> elements, not concatenated into one", async () => {
    sqlHandler = routeSql();
    const response = await renderAdminPage(ENV, url(), NOW);
    const body = await response.text();

    // Regression test for the reported invisibility: Pico's minified CSS leaves the
    // parser inside an open rule, so anything appended after it *inside the same
    // <style> tag* is parsed as a CSS-nested child of Pico's last selector and never
    // matches anything — the rule text is present in the page but inert, which is
    // exactly what let the old "the CSS text is present" assertion pass while the bars
    // were invisible. This asserts the structural fix instead: a second <style>
    // element whose content opens with our own first rule, not with Pico's.
    //
    // What this test would catch: the two CSS blocks being merged back into one
    // <style> tag. What it would NOT catch: a single stray rule of ours being
    // concatenated onto the wrong block, or Pico's CSS itself being malformed — for
    // that, a real browser's computed styles are still the ground truth.
    const styleBlocks = [...body.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1]);
    expect(styleBlocks.length).toBeGreaterThanOrEqual(2);
    const ourBlock = styleBlocks.find((block) => block.trimStart().startsWith(":root"));
    expect(ourBlock).toBeDefined();
  });

  it("renders no external request — no http(s) resource reference, no <link> and no <script> tag", async () => {
    sqlHandler = routeSql();
    const response = await renderAdminPage(ENV, url(), NOW);
    const body = await response.text();

    // Not a bare "http://" search: Pico's own vendored CSS legitimately carries the SVG
    // XML namespace ("http://www.w3.org/2000/svg") inside an inlined data: URI, which is
    // not a network request and is pre-existing, out-of-scope content. What must be
    // absent is an actual resource-loading reference — an href or src pointing off-page.
    expect(body).not.toMatch(/\b(?:href|src)="https?:\/\//);
    expect(body).not.toContain("<link");
    expect(body).not.toContain("<script");
  });

  it("puts each section's heading on the page background and its table inside a distinct panel below it, not inside the same box", async () => {
    sqlHandler = routeSql({
      perLink: () => Response.json({ data: [{ slug: "foo", clicks: 1 }] }),
      countries: () => Response.json({ data: [{ country: "GB", clicks: 1 }] }),
      referrers: () => Response.json({ data: [{ referrer: "-", clicks: 1 }] }),
      missingSlugs: () => Response.json({ data: [{ slug: "typo", misses: 1 }] }),
    });

    const response = await renderAdminPage(ENV, url());
    const body = await response.text();

    // Signature365's own pattern (task instructions): a heading sitting directly on the
    // page background, then a separate panel box below it holding the table. Not a
    // heading and table sharing one box, which is what the old single <section> rule
    // did. Checked for every ranked table plus the per-link table.
    for (const [heading, marker] of [
      ["Per-link clicks", "foo"],
      ["Top countries", "GB"],
      ["Top referrers", "(none)"],
      ["Top missing slugs", "typo"],
    ]) {
      const headingIndex = body.indexOf(`<h2>${heading}</h2>`);
      expect(headingIndex, `expected an <h2>${heading}</h2>`).toBeGreaterThan(-1);
      const panelIndex = body.indexOf('<div class="panel">', headingIndex);
      expect(panelIndex, `expected a panel after the "${heading}" heading`).toBeGreaterThan(
        headingIndex,
      );
      const tableIndex = body.indexOf("<table>", panelIndex);
      expect(tableIndex, `expected a table inside the "${heading}" panel`).toBeGreaterThan(
        panelIndex,
      );
      const markerIndex = body.indexOf(marker, tableIndex);
      expect(markerIndex, `expected "${marker}" inside the "${heading}" table`).toBeGreaterThan(
        tableIndex,
      );
    }
  });

  it("gives the panel its own background and border tokens, separate from the page background", async () => {
    sqlHandler = routeSql();
    const response = await renderAdminPage(ENV, url(), NOW);
    const body = await response.text();

    // .panel is the box in the screenshots — --s-page-accent-bg with a border and
    // rounded corners — distinct from the plain page background the heading sits on.
    const styleBlocks = [...body.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1]);
    const ourBlock = styleBlocks.find((block) => block.trimStart().startsWith(":root")) ?? "";
    expect(ourBlock).toMatch(/\.panel\s*\{[^}]*background:\s*var\(--s-page-accent-bg\)/);
    expect(ourBlock).toMatch(/\.panel\s*\{[^}]*border:\s*1px solid var\(--s-border-color\)/);
    expect(ourBlock).toMatch(/\.panel\s*\{[^}]*border-radius:\s*var\(--s-space-xs\)/);
  });

  it("degrades one table on its own when its query fails, leaving the rest of the page intact", async () => {
    sqlHandler = routeSql({
      countries: () => new Response("nope", { status: 500 }),
      referrers: () => Response.json({ data: [{ referrer: "-", clicks: 1 }] }),
      perLink: () => Response.json({ data: [{ slug: "foo", clicks: 1 }] }),
    });

    const response = await renderAdminPage(ENV, url());
    expect(response.status).toBe(200);
    const body = await response.text();

    // The failing countries table still surfaces an inline error notice...
    expect(body.toLowerCase()).toContain("error");
    // ...but the rest of the page — including the other tables — is unaffected.
    expect(body).toContain("foo");
    expect(body).toContain("(none)");
  });
});
