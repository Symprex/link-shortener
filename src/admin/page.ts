// The admin statistics page itself (D6, D8, D10, D11, T10, T11): one server-rendered
// document behind the Access gate in src/index.ts, with no client-side JavaScript and
// no client state — the 7/30/90 window is chosen entirely by which link was clicked.
//
// A failing or non-200 Analytics Engine query renders the page with an inline error
// notice rather than a 500 or a blank page (spec edge case): the totals and the
// per-link table are simply missing, and the window selector still works. The three
// T11 tables (countries, referrers, missing slugs) are fetched independently of the
// totals/per-link pair and of each other, so one of them failing degrades only its own
// section rather than the whole page.
import type { DailyClicksRow } from "./chart.ts";
import type {
  AnalyticsQueryEnv,
  CountryRow,
  MissingSlugRow,
  PerLinkRow,
  ReferrerRow,
  TotalsRow,
  WindowDays,
} from "./queries.ts";
import { fillDailySeries, renderClicksChart } from "./chart.ts";
import { escapeHtml } from "../html.ts";
import { THEME_CSS } from "../theme.ts";
import { PICO_CSS } from "../vendor/pico.ts";
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
} from "./queries.ts";

const WINDOW_OPTIONS: readonly WindowDays[] = [7, 30, 90];

/** The `-` placeholder Analytics Engine blobs use for an absent value (T6). */
const NO_VALUE = "-";

/** A query's outcome: its rows, or the message to show in that section's error notice. */
type SectionResult<Row> = { rows: Row[] } | { error: string };

/**
 * Formats a two-letter region code into its full English name for the Top countries table.
 * Constructed once at module scope, not per row — the Intl.DisplayNames constructor does
 * non-trivial locale setup work that a per-row call would repeat for no benefit.
 */
const REGION_NAMES = new Intl.DisplayNames(["en-GB"], { type: "region" });

/**
 * The admin-only CSS on top of the shared Signature365 theme (src/theme.ts): the panel,
 * tables, badge and percentage bars this page needs, rendered alongside `THEME_CSS` in a
 * second inlined `<style>` tag — see renderPage()'s own comment for why it cannot share
 * Pico's tag — rather than an external stylesheet, so this page still issues no requests
 * beyond the six Analytics Engine queries.
 *
 * The tokens, the Pico variable overrides and the rules both this page and the redirect
 * Worker's 404 page share (`body`, `h1`/`h2`, `section`) moved to src/theme.ts so a second
 * copy of the palette cannot drift from this one — see that module's own comment for the
 * Signature365 source and the dark-mode reasoning. What stays here is admin-only: nothing
 * below is used by the 404 page.
 *
 * `.panel` is the Signature365 layout pattern (per the task): a section heading sitting
 * directly on the page background, then a visually distinct box below it — `.panel`,
 * not `section` itself — holding the table or chart. Every block below (renderReport,
 * renderChartSection, renderSection) wraps its content in a `<div class="panel">` for
 * exactly this reason.
 *
 * The bars themselves were the fix for the reported invisibility: `--pico-primary` and
 * `--pico-muted-border-color` do not resolve to a visible colour in the classless build's
 * dark scope, so `.bar-track` and `.bar-fill` are given the `--s-*`/`--sig365-*` tokens
 * directly rather than routed back through Pico's variables.
 */
const EXTRA_CSS = `
h2 {
  margin-bottom: var(--s-space-sm);
}
.panel {
  background: var(--s-page-accent-bg);
  border: 1px solid var(--s-border-color);
  border-radius: var(--s-space-xs);
  padding: var(--s-space-md);
}
table {
  border-color: var(--s-table-row-border);
}
thead th {
  background: var(--s-table-header-bg);
}
td, th {
  padding: var(--s-space-sm) var(--s-space-md);
  border-bottom: 1px solid var(--s-table-row-border);
}
.country-badge {
  display: inline-block;
  padding: 0 0.35em;
  margin-right: 0.35em;
  font-size: 0.75em;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--s-muted-color);
  background: var(--s-code-bg);
  border-radius: 0.25em;
}
.pct {
  color: var(--s-muted-color);
  font-size: 0.85em;
}
.bar-track {
  height: 6px;
  width: 100%;
  margin-top: 0.25em;
  background: var(--s-border-color);
  border-radius: 3px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: var(--sig365-theme-link-color);
}
`;

/**
 * Pico and our own CSS as two separate `<style>` tags, never one. Pico's minified CSS
 * leaves the parser inside an open rule, so anything appended after it inside the *same*
 * `<style>` tag is parsed as a CSS-nested child of Pico's last selector and never matches
 * — this was the reported invisibility: the rules were present in the HTML but inert,
 * nested under a selector that never applies. Verified live in a browser by splitting the
 * tag: doing so alone made the tokens, the panel background and the bars resolve.
 */
const STYLE_TAGS = `<style>${PICO_CSS}</style>
    <style>${THEME_CSS}${EXTRA_CSS}</style>`;

/**
 * Renders `/admin`: fetches the totals and all four tables for the selected window.
 *
 * `now` defaults to the real clock and is threaded into every query builder and into the
 * chart's fillDailySeries as the one instant this request agrees the window is anchored to
 * (T12 must-fix). Two independent `new Date()` calls a few milliseconds apart never
 * disagree about which calendar day is "today" in practice, but a single shared instant is
 * the only way to guarantee it — and it is what makes the alignment testable at all
 * (page.test.ts injects a fixed `now` to prove the SQL bound and the chart's first bucket
 * are the same calendar day).
 */
export async function renderAdminPage(
  env: AnalyticsQueryEnv,
  url: URL,
  now: Date = new Date(),
): Promise<Response> {
  const days = parseDays(url.searchParams.get("days"));

  let totals: TotalsRow | null = null;
  let perLink: PerLinkRow[] = [];
  let error: string | null = null;

  // All six queries are kicked off together — the T11 sections and the T12 chart resolve
  // independently of the totals/per-link pair (and of each other), so nothing here waits
  // on anything else. fetchTotalsAndPerLink() catches its own rejection immediately
  // (rather than deferring to a try/catch around a later await) so a failure cannot
  // surface as an unhandled rejection while the sections above are still in flight.
  const [totalsResult, dailyClicks, countries, referrers, missingSlugs] = await Promise.all([
    fetchTotalsAndPerLink(env, days, now),
    runSection<DailyClicksRow>(env, buildDailyClicksQuery(days, now)),
    runSection<CountryRow>(env, buildTopCountriesQuery(days, now)),
    runSection<ReferrerRow>(env, buildTopReferrersQuery(days, now)),
    runSection<MissingSlugRow>(env, buildTopMissingSlugsQuery(days, now)),
  ]);

  if ("error" in totalsResult) {
    error = totalsResult.error;
  } else {
    totals = totalsResult.totals;
    perLink = totalsResult.perLink;
  }

  const body = renderPage(
    days,
    totals,
    perLink,
    error,
    dailyClicks,
    countries,
    referrers,
    missingSlugs,
    now,
  );
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** Runs one of the T11 queries, turning a thrown or non-200 failure into an error result. */
async function runSection<Row>(env: AnalyticsQueryEnv, sql: string): Promise<SectionResult<Row>> {
  try {
    return { rows: await runAnalyticsQuery<Row>(env, sql) };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : String(cause) };
  }
}

/** The totals and per-link queries' combined outcome (they share a single error notice). */
type TotalsAndPerLinkResult = { totals: TotalsRow; perLink: PerLinkRow[] } | { error: string };

async function fetchTotalsAndPerLink(
  env: AnalyticsQueryEnv,
  days: WindowDays,
  now: Date,
): Promise<TotalsAndPerLinkResult> {
  try {
    const [totalsRows, perLinkRows] = await Promise.all([
      runAnalyticsQuery<TotalsRow>(env, buildTotalsQuery(days, now)),
      runAnalyticsQuery<PerLinkRow>(env, buildPerLinkQuery(days, now)),
    ]);
    return {
      totals: totalsRows[0] ?? { clicks: 0, visitors: 0 },
      perLink: mergeHomeSlugRows(perLinkRows),
    };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : String(cause) };
  }
}

function renderPage(
  days: WindowDays,
  totals: TotalsRow | null,
  perLink: PerLinkRow[],
  error: string | null,
  dailyClicks: SectionResult<DailyClicksRow>,
  countries: SectionResult<CountryRow>,
  referrers: SectionResult<ReferrerRow>,
  missingSlugs: SectionResult<MissingSlugRow>,
  now: Date,
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Symprex Go</title>
    ${STYLE_TAGS}
  </head>
  <body>
    <main>
      <h1>Symprex Go</h1>
      ${renderWindowSelector(days)}
      ${error ? renderError(error) : renderReport(totals, perLink)}
      ${renderChartSection(days, dailyClicks, now)}
      ${renderSection("Top countries", countries, renderCountryRow, (row) => row.clicks, ["Country", "Clicks"])}
      ${renderSection("Top referrers", referrers, renderReferrerRow, (row) => row.clicks, ["Referrer", "Clicks"])}
      ${renderSection("Top missing slugs", missingSlugs, renderMissingSlugRow, (row) => row.misses, ["Slug", "Misses"])}
    </main>
  </body>
</html>
`;
}

function renderWindowSelector(selected: WindowDays): string {
  const links = WINDOW_OPTIONS.map((days) => {
    const label = `${days} days`;
    return days === selected ? `<strong>${label}</strong>` : `<a href="?days=${days}">${label}</a>`;
  }).join(" · ");
  return `<nav><ul><li>${links}</li></ul></nav>`;
}

function renderError(message: string): string {
  return `<p role="alert">Error loading statistics: ${escapeHtml(message)}</p>`;
}

function renderReport(totals: TotalsRow | null, perLink: PerLinkRow[]): string {
  const clicks = totals?.clicks ?? 0;
  const visitors = totals?.visitors ?? 0;
  // The number of distinct slugs that received at least one click in this window, not
  // the number of links configured. The home-page redirect now has its own '/' row in
  // perLink (buildPerLinkQuery no longer excludes it), so it counts here too — a
  // deliberate choice, not an oversight: '/' is a genuine row in the table this count
  // is drawn from, so excluding it here while showing it there would reintroduce the
  // same table/summary mismatch the '/' row was added to remove.
  const activeLinks = perLink.length;

  return `
      <section>
        <h2>Overview</h2>
        <div class="panel">
          <ul>
            <li>Clicks: <strong>${clicks}</strong></li>
            <li>Visitors: <strong>${visitors}</strong></li>
            <li>Active links: <strong>${activeLinks}</strong></li>
          </ul>
        </div>
      </section>
      <section>
        <h2>Per-link clicks</h2>
        <div class="panel">
          <table>
            <thead>
              <tr>
                <th scope="col">Slug</th>
                <th scope="col">Clicks</th>
              </tr>
            </thead>
            <tbody>
              ${withPercent(perLink, (row) => row.clicks)
                .map(([row, pct]) => renderLinkRow(row, pct))
                .join("\n              ")}
            </tbody>
          </table>
        </div>
      </section>`;
}

function renderLinkRow(row: PerLinkRow, pct: number): string {
  return renderRankedRow(escapeHtml(row.slug), row.clicks, pct);
}

/**
 * Renders the T12 clicks-over-time chart: an inline error notice, scoped to this section
 * only, when the daily-clicks query failed, or the zero-filled series as an inline SVG
 * otherwise. Degrades on its own the same way the T11 sections do, rather than blanking
 * the rest of the page.
 */
function renderChartSection(
  days: WindowDays,
  result: SectionResult<DailyClicksRow>,
  now: Date,
): string {
  if ("error" in result) {
    return `
      <section>
        <h2>Clicks per day</h2>
        <p role="alert">Error loading statistics: ${escapeHtml(result.error)}</p>
      </section>`;
  }

  const points = fillDailySeries(result.rows, days, now);
  return `
      <section>
        <h2>Clicks per day</h2>
        <div class="panel">
          ${renderClicksChart(points)}
        </div>
      </section>`;
}

/**
 * Renders one of the T11 top-10 tables: an inline error notice, scoped to this section
 * only, when its own query failed, or a heading and table of rows otherwise.
 *
 * `countOf` reads each row's own count so this can compute the percentage bars from the
 * table's own total (withPercent), the same denominator every ranked table in this file
 * uses.
 */
function renderSection<Row>(
  title: string,
  result: SectionResult<Row>,
  renderRow: (row: Row, pct: number) => string,
  countOf: (row: Row) => number,
  [firstHeader, secondHeader]: readonly [string, string],
): string {
  if ("error" in result) {
    return `
      <section>
        <h2>${escapeHtml(title)}</h2>
        <p role="alert">Error loading statistics: ${escapeHtml(result.error)}</p>
      </section>`;
  }

  return `
      <section>
        <h2>${escapeHtml(title)}</h2>
        <div class="panel">
          <table>
            <thead>
              <tr>
                <th scope="col">${escapeHtml(firstHeader)}</th>
                <th scope="col">${escapeHtml(secondHeader)}</th>
              </tr>
            </thead>
            <tbody>
              ${withPercent(result.rows, countOf)
                .map(([row, pct]) => renderRow(row, pct))
                .join("\n              ")}
            </tbody>
          </table>
        </div>
      </section>`;
}

/**
 * Pairs each row with its percentage share of this table's own total — the sum of the
 * rows shown here, not the page-wide clicks total. A top-10 table does not sum to the
 * page total, so dividing by the page total would understate every row's share; dividing
 * by the table's own total is what makes each bar read as "this row's share of this
 * table". An empty table or an all-zero table would otherwise divide by zero, so both are
 * guarded explicitly rather than left to produce NaN.
 */
function withPercent<Row>(
  rows: readonly Row[],
  countOf: (row: Row) => number,
): Array<[Row, number]> {
  const total = rows.reduce((sum, row) => sum + countOf(row), 0);
  return rows.map((row) => [row, total > 0 ? clampPercent((countOf(row) / total) * 100) : 0]);
}

/** Rounds to a whole percentage and clamps to [0, 100], so no NaN, Infinity or out-of-range width ever reaches the page. */
function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * A thin bar under a row's label showing its share of the table's own total, sized by an
 * inline percentage width (no client JavaScript). It sits beside the count and percentage
 * text, which already carry the information in text form, so the bar itself is marked
 * `aria-hidden` rather than announced to assistive technology as its own content.
 */
function renderBar(pct: number): string {
  return `<div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width: ${pct}%"></div></div>`;
}

/** One ranked-table row shared by all four tables: a label with its bar beneath it, and the count with its share beside it. */
function renderRankedRow(label: string, count: number, pct: number): string {
  return `<tr><td>${label}${renderBar(pct)}</td><td>${count} <span class="pct">${pct}%</span></td></tr>`;
}

/**
 * Renders a country blob for display: `-` means Cloudflare could not determine a country,
 * so it is relabelled rather than shown as a bare dash and never reaches Intl.DisplayNames.
 * Otherwise, an uppercase code badge followed by the full name (T-badge): `GB` then
 * `United Kingdom`.
 */
function renderCountryRow(row: CountryRow, pct: number): string {
  if (row.country === NO_VALUE) return renderRankedRow("(unknown)", row.clicks, pct);
  const code = escapeHtml(row.country.toUpperCase());
  const name = escapeHtml(countryName(row.country));
  const label = `<span class="country-badge">${code}</span> ${name}`;
  return renderRankedRow(label, row.clicks, pct);
}

/**
 * The full English name for a two-letter region code, via Intl.DisplayNames (verified
 * against this repo's own workerd runtime — GB, US and PL resolve to United Kingdom,
 * United States and Poland). Falls back to the bare code for a code Intl.DisplayNames
 * cannot resolve to a name: `.of()` returns `undefined` for some unrecognised-but-well-formed
 * codes and throws a RangeError outright for a malformed one, and neither should surface as
 * `undefined` text or a 500.
 */
function countryName(code: string): string {
  try {
    return REGION_NAMES.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Renders a referer blob for display. `-` means the request carried no Referer header,
 * so it is relabelled rather than shown as a bare dash. The referer itself is
 * attacker-controlled (it arrives from a request header), so it is always escaped.
 */
function renderReferrerRow(row: ReferrerRow, pct: number): string {
  const referrer = row.referrer === NO_VALUE ? "(none)" : escapeHtml(row.referrer);
  return renderRankedRow(referrer, row.clicks, pct);
}

function renderMissingSlugRow(row: MissingSlugRow, pct: number): string {
  return renderRankedRow(escapeHtml(row.slug), row.misses, pct);
}
