// The admin page's window selection and the SQL sent to Analytics Engine's SQL API
// (D6, D11, T10). Pure and independently testable: no fetch here, just the string that
// runAnalyticsQuery later posts.
//
// All queries read the dataset T6 writes (link_shortener_redirects) and all but the
// missing-slugs query exclude double1 = 1 (a miss, not a click on a real link — T11
// renders those separately). The home-page redirect indexes itself under the literal
// slug '/' (src/redirect.ts), a real row buildPerLinkQuery no longer excludes — but the
// live dataset also carries rows written before that change, with an empty-string slug,
// and Analytics Engine's three-month retention means those do not disappear.
// buildPerLinkQuery no longer folds blob1 = '' into '/' in SQL; mergeHomeSlugRows does it
// in TypeScript after the rows come back, so the two aggregate into one row rather than
// showing a blank row beside a '/' row.
//
// Every GROUP BY here is a bare column name, never an expression, despite Cloudflare's
// own SQL API docs saying `GROUP BY <expression>` is allowed and showing an expression
// as an example. It is not: the live API returned a 422 ("in the GROUP BY clause you may
// only provide column names") for `GROUP BY if("blob1" = '', '/', "blob1")`, which is
// what buildPerLinkQuery used to emit. Trust the live API, not the docs, and run
// scripts/check-analytics-sql.ts against a real token before trusting a new query
// builder's GROUP BY, whatever the docs say it should accept.
//
// The time-bound and day-bucketing constructs are not invented: they are the ones the old
// Nuxt implementation (still in the tree) proves work against this same Analytics Engine
// SQL API — server/utils/query-filter.ts's appendTimeFilter for `toDateTime(unixSeconds)`,
// server/api/stats/views.get.ts's query2sql for `formatDateTime(timestamp, '%Y-%m-%d',
// 'Etc/UTC')`. `NOW() - INTERVAL` and `toStartOfInterval`, used in an earlier revision,
// were never demonstrated anywhere in this codebase and have been dropped.

/** The three window lengths the admin page offers (D11); 90 is the retention ceiling. */
export type WindowDays = 7 | 30 | 90;

const VALID_WINDOW_DAYS: readonly WindowDays[] = [7, 30, 90];
const DEFAULT_WINDOW_DAYS: WindowDays = 30;

const DATASET = "link_shortener_redirects";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parses the `days` query parameter into one of the three offered windows, falling back
 * to the 30-day default for anything else — including a missing value, a value that is
 * not a number, and a number that is not one of the three offered windows.
 */
export function parseDays(value: string | null): WindowDays {
  if (value === null) return DEFAULT_WINDOW_DAYS;
  const parsed = Number(value);
  return isWindowDays(parsed) ? parsed : DEFAULT_WINDOW_DAYS;
}

function isWindowDays(value: number): value is WindowDays {
  return VALID_WINDOW_DAYS.includes(value as WindowDays);
}

/**
 * The instant at UTC midnight `days - 1` calendar days before `now`'s calendar day — the
 * earliest day the window includes. Exported so src/admin/chart.ts's fillDailySeries can
 * anchor its zero-filled buckets to the exact same instant this module bounds its SQL to
 * (T12 must-fix): a rolling "now minus N*24h" bound and a calendar-day bucket list
 * disagree at every hour but midnight, silently dropping the window's edge day.
 *
 * `days` is a plain count rather than `WindowDays`: the calendar-day math here holds for
 * any positive number of days, not just the three windows the admin page offers.
 */
export function windowStart(days: number, now: Date): Date {
  const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(todayUtcMidnight - (days - 1) * DAY_MS);
}

/** The SQL WHERE fragment bounding a query to the window, via the old implementation's proven `toDateTime(unixSeconds)` construct. */
function timeBound(days: WindowDays, now: Date): string {
  const unixSeconds = Math.floor(windowStart(days, now).getTime() / 1000);
  return `timestamp >= toDateTime(${unixSeconds})`;
}

/**
 * Total clicks and distinct visitors for the window. The home-page redirect is a real
 * click, with its own row in the per-link table (buildPerLinkQuery) since it indexes
 * itself under '/' — so the totals now equal the sum of that table.
 */
export function buildTotalsQuery(days: WindowDays, now: Date = new Date()): string {
  return (
    `SELECT COUNT() AS clicks, COUNT(DISTINCT blob2) AS visitors ` +
    `FROM ${DATASET} ` +
    `WHERE ${timeBound(days, now)} AND double1 = 0`
  );
}

/**
 * Per-link click counts for the window, including the home-page redirect as its own
 * '/' row, sorted by clicks descending.
 *
 * Groups by the bare `blob1` column, not an expression: the live Analytics Engine SQL
 * API rejects a GROUP BY expression with a 422 ("in the GROUP BY clause you may only
 * provide column names"), which contradicts Cloudflare's own SQL API docs — they say
 * `GROUP BY <expression>` is allowed and give an expression as an example. Trust the
 * live API, not the docs. The coalescing this query used to do in SQL (folding an
 * empty-string slug — written before the home redirect indexed itself as '/' — into
 * the same row as a '/' hit) now happens in TypeScript, in mergeHomeSlugRows below,
 * after the rows come back.
 */
export function buildPerLinkQuery(days: WindowDays, now: Date = new Date()): string {
  return (
    `SELECT blob1 AS slug, COUNT() AS clicks ` +
    `FROM ${DATASET} ` +
    `WHERE ${timeBound(days, now)} AND double1 = 0 ` +
    `GROUP BY blob1 ` +
    `ORDER BY clicks DESC`
  );
}

/**
 * Folds an empty-string slug — written before the home redirect indexed itself as '/'
 * (src/redirect.ts) — into the same row as a genuine '/' hit, summing their clicks
 * rather than one overwriting the other: both can be present in the same result set,
 * since Analytics Engine's three-month retention keeps the legacy empty-slug rows
 * arriving until roughly December 2026. Re-sorts by clicks descending afterwards,
 * since the merged row's total can outrank rows that led before the merge. Pure and
 * exported so it is testable independently of the fetch buildPerLinkQuery's caller
 * makes.
 */
export function mergeHomeSlugRows(rows: readonly PerLinkRow[]): PerLinkRow[] {
  const clicksBySlug = new Map<string, number>();
  for (const row of rows) {
    const slug = row.slug === "" ? "/" : row.slug;
    clicksBySlug.set(slug, (clicksBySlug.get(slug) ?? 0) + row.clicks);
  }
  return [...clicksBySlug.entries()]
    .map(([slug, clicks]) => ({ slug, clicks }))
    .sort((a, b) => b.clicks - a.clicks);
}

/** Top 10 countries by clicks (hits only) for the window, sorted by clicks descending. */
export function buildTopCountriesQuery(days: WindowDays, now: Date = new Date()): string {
  return (
    `SELECT blob4 AS country, COUNT() AS clicks ` +
    `FROM ${DATASET} ` +
    `WHERE ${timeBound(days, now)} AND double1 = 0 ` +
    `GROUP BY blob4 ` +
    `ORDER BY clicks DESC LIMIT 10`
  );
}

/** Top 10 referrers by clicks (hits only) for the window, sorted by clicks descending. */
export function buildTopReferrersQuery(days: WindowDays, now: Date = new Date()): string {
  return (
    `SELECT blob3 AS referrer, COUNT() AS clicks ` +
    `FROM ${DATASET} ` +
    `WHERE ${timeBound(days, now)} AND double1 = 0 ` +
    `GROUP BY blob3 ` +
    `ORDER BY clicks DESC LIMIT 10`
  );
}

/**
 * Clicks (hits only) per day for the window, sorted chronologically (T12). Analytics
 * Engine returns no row for a day with no clicks — src/admin/chart.ts's fillDailySeries
 * fills those gaps, this query just leaves them out. `day` is a plain `YYYY-MM-DD`
 * string, the same UTC calendar day fillDailySeries keys its buckets by.
 */
export function buildDailyClicksQuery(days: WindowDays, now: Date = new Date()): string {
  return (
    `SELECT formatDateTime(timestamp, '%Y-%m-%d', 'Etc/UTC') AS day, COUNT() AS clicks ` +
    `FROM ${DATASET} ` +
    `WHERE ${timeBound(days, now)} AND double1 = 0 ` +
    `GROUP BY day ` +
    `ORDER BY day ASC`
  );
}

/**
 * Top 10 slugs asked for that do not exist (miss events, double1 = 1) for the window —
 * the payoff for D10's 404 miss logging. Excludes the empty-slug home-page redirect, the
 * same way buildPerLinkQuery does for hits.
 */
export function buildTopMissingSlugsQuery(days: WindowDays, now: Date = new Date()): string {
  return (
    `SELECT blob1 AS slug, COUNT() AS misses ` +
    `FROM ${DATASET} ` +
    `WHERE ${timeBound(days, now)} AND double1 = 1 AND blob1 != '' ` +
    `GROUP BY blob1 ` +
    `ORDER BY misses DESC LIMIT 10`
  );
}

/** The Worker env fields the SQL API call needs. */
export interface AnalyticsQueryEnv {
  CF_API_TOKEN: string;
}

/** One row of the totals query's result. */
export interface TotalsRow {
  clicks: number;
  visitors: number;
}

/** One row of the per-link query's result. */
export interface PerLinkRow {
  slug: string;
  clicks: number;
}

/** One row of the top-countries query's result. `country` is `-` when Cloudflare could not determine one. */
export interface CountryRow {
  country: string;
  clicks: number;
}

/** One row of the top-referrers query's result. `referrer` is `-` when the request carried no Referer header. */
export interface ReferrerRow {
  referrer: string;
  clicks: number;
}

/** One row of the top-missing-slugs query's result. */
export interface MissingSlugRow {
  slug: string;
  misses: number;
}

/** The account this Worker is deployed to — the SQL API is scoped by account, not by dataset. */
const ACCOUNT_ID = "93686db668e1fd06177661df08f7c0cd";
// Exported so scripts/check-analytics-sql.ts posts to the same endpoint this module
// does, rather than re-deriving it from a second copy of the account id.
export const SQL_API_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql`;

/**
 * Runs one SQL statement against the Analytics Engine SQL API and returns its rows.
 * Throws on a non-200 response or an unparseable body — the caller (renderAdminPage) is
 * responsible for turning that into an inline error notice rather than a 500.
 */
export async function runAnalyticsQuery<Row>(env: AnalyticsQueryEnv, sql: string): Promise<Row[]> {
  const response = await fetch(SQL_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
    body: sql,
  });
  if (!response.ok) {
    // Include the body, not just the status. A 422 from this API means the SQL was
    // rejected, and the body is the only place it says which construct it disliked —
    // reporting the bare status turned a one-line diagnosis into a guessing game.
    // Truncated because it is rendered into the page's error notice.
    let detail = "";
    try {
      detail = (await response.text()).trim().slice(0, 300);
    } catch {
      // A body that cannot be read must not mask the status.
    }
    throw new Error(
      detail
        ? `Analytics Engine SQL API responded ${response.status}: ${detail}`
        : `Analytics Engine SQL API responded ${response.status}`,
    );
  }

  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new Error("Analytics Engine SQL API returned an unexpected body");
  }
  // The Analytics Engine SQL API returns COUNT() and COUNT(DISTINCT ...) as JSON strings,
  // not numbers (observed live: the per-link table rendered "0131 0%" for a slug with 131
  // clicks — `0 + "131"` string concatenation, downstream in mergeHomeSlugRows). Coerced
  // once here, at the parse boundary, so every consumer downstream (mergeHomeSlugRows, the
  // percentage bars and totals in page.ts, fillDailySeries and the SVG scaling in
  // chart.ts) receives real numbers and no future consumer can inherit this bug.
  const rows = body.data.map((row) => (isRecord(row) ? coerceNumericFields(row) : row));
  // `rows` is proved to be an array whose object elements have had their known numeric
  // fields coerced above; the per-row shape beyond that is still not validated at runtime,
  // so this single cast trusts the caller's SELECT (which names every column it reads)
  // rather than the API response. A column the SQL never selects surfaces as `undefined`
  // at the render call site, not here — an accepted, narrow trust boundary rather than a
  // shape the Worker would gain much by re-validating.
  return rows as Row[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The field names every query builder above selects a count under (clicks, visitors,
 * misses) — the only fields the live API sends as numeric-looking strings. `slug`,
 * `country`, `referrer` and `day` are left alone: `day` in particular is a `YYYY-MM-DD`
 * label, not a number, and coercing it would corrupt it rather than fix it.
 */
const NUMERIC_FIELDS = new Set(["clicks", "visitors", "misses"]);

/**
 * Coerces one API row's known numeric fields from whatever the API sent (a string, in
 * practice) into real numbers, defaulting a null or non-finite value to 0 rather than
 * letting NaN reach a caller that adds, divides or scales an SVG coordinate by it. Only
 * touches a field this row actually selected — it does not invent `visitors: 0` on a
 * per-link row that never asked for a visitor count.
 */
function coerceNumericFields(row: Record<string, unknown>): Record<string, unknown> {
  const coerced: Record<string, unknown> = { ...row };
  for (const field of NUMERIC_FIELDS) {
    if (field in coerced) coerced[field] = toFiniteNumber(coerced[field]);
  }
  return coerced;
}

/** Parses a value into a finite number, defaulting an absent, null or otherwise non-finite value to 0. */
function toFiniteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
