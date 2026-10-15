// Engineer-run diagnostic against the real Analytics Engine SQL API — posts every admin
// query builder's SQL to it and reports, per query, whether the live API accepted it. Not
// wired into deploy-worker.yml or any other workflow: it needs a CF_API_TOKEN scoped to
// read this account's Analytics Engine data, which CI deliberately does not hold (see
// AGENTS.md — the deploy token is deliberately narrower than that).
//
// Exists because the unit tests in src/admin/queries.test.ts only ever assert on the SQL
// string a builder chose to emit, never on whether the API accepts it — that gap is
// exactly how buildPerLinkQuery's `GROUP BY if(blob1 = '', '/', blob1)` reached production
// and came back a 422 ("in the GROUP BY clause you may only provide column names"), even
// though Cloudflare's own SQL API docs say `GROUP BY <expression>` is allowed. Trust the
// live API, not the docs: this script is how the next dialect mismatch is found in one
// command, against every query builder at once, instead of one browser reload per query.
//
// Runs with plain `node` (no build step, no runtime dependencies), same as
// scripts/validate-links.ts.
import type { WindowDays } from '../src/admin/queries.ts'
import {
  buildDailyClicksQuery,
  buildPerLinkQuery,
  buildTopCountriesQuery,
  buildTopMissingSlugsQuery,
  buildTopReferrersQuery,
  buildTotalsQuery,
  SQL_API_URL,
} from '../src/admin/queries.ts'

const WINDOW_DAYS: WindowDays = 30

export interface QueryCheck {
  name: string
  sql: string
}

/**
 * The six query builders admin/page.ts sends to the SQL API, named for the table this
 * script's PASS/FAIL report is keyed by. Built against a fixed 30-day window — the SQL
 * API either accepts a query's shape or it doesn't, so which window it runs against
 * makes no difference to the outcome this script reports.
 */
export function buildQueryChecks(now: Date = new Date()): QueryCheck[] {
  return [
    { name: 'buildTotalsQuery', sql: buildTotalsQuery(WINDOW_DAYS, now) },
    { name: 'buildPerLinkQuery', sql: buildPerLinkQuery(WINDOW_DAYS, now) },
    { name: 'buildTopCountriesQuery', sql: buildTopCountriesQuery(WINDOW_DAYS, now) },
    { name: 'buildTopReferrersQuery', sql: buildTopReferrersQuery(WINDOW_DAYS, now) },
    { name: 'buildDailyClicksQuery', sql: buildDailyClicksQuery(WINDOW_DAYS, now) },
    { name: 'buildTopMissingSlugsQuery', sql: buildTopMissingSlugsQuery(WINDOW_DAYS, now) },
  ]
}

export interface QueryCheckResult {
  name: string
  status: 'PASS' | 'FAIL'
  detail: string
}

/**
 * Turns one SQL API response into a PASS/FAIL result. PASS only on a 200, regardless of
 * body content; FAIL otherwise, carrying the API's own error text truncated to a table-
 * friendly length — the body is the only place a 422 says which construct it disliked.
 */
export function evaluateResponse(name: string, status: number, bodyText: string): QueryCheckResult {
  return status === 200
    ? { name, status: 'PASS', detail: 'accepted' }
    : { name, status: 'FAIL', detail: `${status}: ${bodyText.trim().slice(0, 300)}` }
}

/** Renders the per-query results as a readable table, one PASS/FAIL line per query builder. */
export function formatTable(results: QueryCheckResult[]): string {
  return results
    .map(result => `  [${result.status}] ${result.name} — ${result.detail}`)
    .join('\n')
}

async function runCheck(check: QueryCheck, token: string): Promise<QueryCheckResult> {
  try {
    const response = await fetch(SQL_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: check.sql,
    })
    const bodyText = await response.text()
    return evaluateResponse(check.name, response.status, bodyText)
  }
  catch (err) {
    return {
      name: check.name,
      status: 'FAIL',
      detail: `request failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function main(): Promise<void> {
  const token = process.env.CF_API_TOKEN
  if (!token) {
    console.error('CF_API_TOKEN is not set.')
    console.error(
      'This is an engineer-run diagnostic against the real Analytics Engine SQL API — it is '
      + 'not run in CI because it needs a token scoped to read this account\'s Analytics '
      + 'Engine data. Set $env:CF_API_TOKEN to such a token and re-run.',
    )
    process.exitCode = 1
    return
  }

  const checks = buildQueryChecks()
  const results: QueryCheckResult[] = []
  for (const check of checks) results.push(await runCheck(check, token))

  console.log(`Analytics Engine SQL API check (${checks.length} queries)\n`)
  console.log(formatTable(results))

  const failed = results.filter(result => result.status === 'FAIL').length
  console.log(`\n${results.length - failed} passed, ${failed} failed`)
  process.exitCode = failed === 0 ? 0 : 1
}

if (import.meta.main)
  await main()
