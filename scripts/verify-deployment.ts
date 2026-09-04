// The replacement proof obligation for the admin Worker's authentication (D21). D21
// deleted the hand-written JWT verifier and its 88 tests in favour of Cloudflare
// Worker-level Access enforcing at the edge — and a spike proved
// @cloudflare/vitest-pool-workers cannot tell an authenticated request from an
// unauthenticated one, so nothing in the vitest suite can prove Access is actually
// wired up. This script is the proof instead: it hits both deployed Workers over real
// HTTP and asserts on what the edge actually did. Runs with plain `node` (no build
// step, no runtime dependencies), same as validate-links.ts, whose readLinkFiles it
// reuses for the expected redirect targets rather than re-reading links/ itself.
import type { LinkFile } from './validate-links.ts'
import { Buffer } from 'node:buffer'
import { fileURLToPath } from 'node:url'
import { readLinkFiles } from './validate-links.ts'

const DEFAULT_REDIRECT_BASE_URL = 'https://link-shortener-redirect.sig365.workers.dev'
const DEFAULT_ADMIN_BASE_URL = 'https://link-shortener-admin.sig365.workers.dev'
const REQUEST_TIMEOUT_MS = 10_000

// Production parity, not a value read out of source: src/index.ts's home redirect is
// asserted against this literal precisely so the check cannot pass by agreeing with
// whatever src/redirect.ts happens to say — see AGENTS.md's independent-expected-value
// rule. If HOME_URL there is ever meant to change, this line has to change too.
const HOME_URL = 'https://www.symprex.com'

export type CheckStatus = 'PASS' | 'FAIL' | 'ERROR'

export interface CheckResult {
  name: string
  status: CheckStatus
  detail: string
}

function pass(name: string, detail: string): CheckResult {
  return { name, status: 'PASS', detail }
}

function fail(name: string, detail: string): CheckResult {
  return { name, status: 'FAIL', detail }
}

function error(name: string, detail: string): CheckResult {
  return { name, status: 'ERROR', detail }
}

/** A plain status-code comparison, for checks with no security weight of their own. */
export function checkStatus(name: string, expected: number, actual: number): CheckResult {
  return actual === expected
    ? pass(name, `${actual}`)
    : fail(name, `expected ${expected}, got ${actual}`)
}

/** True for the team's Access login host, or any subdomain of it — never by substring match. */
function isAccessLoginHost(hostname: string): boolean {
  return hostname === 'cloudflareaccess.com' || hostname.endsWith('.cloudflareaccess.com')
}

/**
 * True when a `Location` header names the Access login host — parsed, so the domain has
 * to be the host and not merely appear somewhere in the path, query or fragment. A
 * Location that will not parse is relative, and an Access login redirect is always
 * absolute and cross-origin, so it cannot be one.
 */
function isAccessLoginLocation(location: string): boolean {
  try {
    return isAccessLoginHost(new URL(location).hostname)
  }
  catch {
    return false
  }
}

const NOT_REFUSED_DETAIL = 'expected a 403, or a 3xx redirected to a cloudflareaccess.com Location'

/**
 * The admin Worker's core security assertion. "Refused" now covers two legitimate
 * forms, both reported by name because the distinction is operationally meaningful: a
 * `403` is the Worker's own fail-closed guard (what you get if Access is ever detached
 * or not yet applied), and a `3xx` to the team's `cloudflareaccess.com` Access domain is
 * Access enforcing at the edge before the Worker runs. A `200` is called out loudest of
 * all, because it means the statistics page is live to an unadmitted caller — and it
 * fails even if a stray `Location` header happens to be present. Anything else,
 * including a redirect to any other host, is a fail: an open redirect off the admin
 * Worker is not a refusal.
 */
export function checkAdminRefused(
  name: string,
  status: number,
  location: string | null,
): CheckResult {
  if (status === 200)
    return fail(name, 'SECURITY: admin path returned 200 OK — the statistics page is exposed')

  if (status === 403)
    return pass(name, '403 (Worker guard)')

  if (status >= 300 && status < 400) {
    if (location === null)
      return fail(name, `${NOT_REFUSED_DETAIL}, got ${status} with no Location`)

    let hostname: string
    try {
      hostname = new URL(location).hostname
    }
    catch {
      return fail(
        name,
        `${NOT_REFUSED_DETAIL}, got ${status} with an unparseable Location ${JSON.stringify(location)}`,
      )
    }

    return isAccessLoginHost(hostname)
      ? pass(name, `${status} -> Access login redirect (${hostname})`)
      : fail(name, `${NOT_REFUSED_DETAIL}, got ${status} redirected to ${hostname}`)
  }

  return fail(name, `${NOT_REFUSED_DETAIL}, got ${status}`)
}

export interface AdminOutcome {
  status: number
  location: string | null
}

/**
 * The proof that Access is actually wired up, not merely that the admin Worker is not
 * exposed. `checkAdminRefused` alone would still report 54/54 green if the Cloudflare
 * Access application were deleted or detached: the Worker's own `403` fail-closed guard
 * answers every request either way. This check requires that at least one of the admin
 * requests this run made was answered with a `3xx` redirected to a
 * `cloudflareaccess.com` login — the one signal that can only come from Access actually
 * enforcing at the edge, not from the Worker's own belt-and-braces guard.
 *
 * An empty `outcomes` — every admin fetch faulted before it could be answered — is an
 * ERROR, not a FAIL: no request was answered either way, so no verdict about Access can
 * be drawn from it.
 */
export function checkAccessWiredUp(name: string, outcomes: AdminOutcome[]): CheckResult {
  if (outcomes.length === 0)
    return error(name, 'no admin request was ever answered — nothing was proved about Access')

  for (const { status, location } of outcomes) {
    if (status < 300 || status >= 400 || location === null)
      continue

    let hostname: string
    try {
      hostname = new URL(location).hostname
    }
    catch {
      continue
    }

    if (isAccessLoginHost(hostname))
      return pass(name, `saw a cloudflareaccess.com login redirect (${hostname})`)
  }

  return fail(
    name,
    'no admin request was answered with a cloudflareaccess.com login redirect — Access may be detached, even though every path still refused',
  )
}

/**
 * The refusal must not be storable by a shared cache. Access's own header is
 * `private, max-age=0, no-store, no-cache, must-revalidate, post-check=0, pre-check=0`,
 * so this checks that `no-store` is present among the comma-separated directives rather
 * than demanding the header equal it exactly.
 */
export function checkNoStore(name: string, cacheControl: string | null): CheckResult {
  if (cacheControl === null)
    return fail(name, 'Cache-Control was (absent), expected "no-store" among its directives')

  const directives = cacheControl.split(',').map(directive => directive.trim().toLowerCase())
  return directives.includes('no-store')
    ? pass(name, `Cache-Control: ${cacheControl}`)
    : fail(
        name,
        `Cache-Control was ${JSON.stringify(cacheControl)}, expected "no-store" among its directives`,
      )
}

/** An exact `Location` match — a query string or trailing difference is a fail, not a near-pass. */
export function checkLocation(name: string, expected: string, actual: string | null): CheckResult {
  return actual === expected
    ? pass(name, `Location: ${actual}`)
    : fail(
        name,
        `expected Location ${JSON.stringify(expected)}, got ${actual === null ? '(absent)' : JSON.stringify(actual)}`,
      )
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The admin refusal body must carry none of the statistics page's content: table
 * markup, the word "Clicks", the chart's SVG, or any of the real slugs it lists.
 * Checked case-insensitively, since a leak would still be a leak in any case.
 *
 * The markup terms are matched as plain substrings — `<table` and `<svg` cannot occur
 * in ordinary prose. The slugs are matched on a word boundary instead: the live slugs
 * (`careers`, `status`, `support`) are ordinary English words, and Cloudflare's own
 * Access login page is free to say "unsupported browser" or "connection statuses"
 * without that being a leak of the statistics table's support/status rows. The same
 * file already prefers exact matching over substring matching for this reason —
 * `isAccessLoginHost` does hostname equality rather than `.includes()` — this is the
 * same precision applied to slugs.
 */
export function checkBodyExcludesStatistics(
  name: string,
  bodyText: string,
  slugs: string[],
): CheckResult {
  const lower = bodyText.toLowerCase()
  const markupTerms = ['<table', 'clicks', '<svg']
  const leaked = markupTerms.filter(term => lower.includes(term))
  for (const slug of slugs) {
    const boundary = new RegExp(`\\b${escapeRegExp(slug.toLowerCase())}\\b`)
    if (boundary.test(lower))
      leaked.push(slug.toLowerCase())
  }
  return leaked.length === 0
    ? pass(name, 'no statistics content in refusal body')
    : fail(name, `refusal body leaked: ${leaked.join(', ')}`)
}

/**
 * The redirect Worker's core security assertion, in the opposite direction from
 * checkAdminRefused: a `403`, or a redirect to a `cloudflareaccess.com` login, means
 * Access has been wrongly applied to the public Worker and every company short link is
 * broken. Anything else — including a plain `404` for an unknown path — is fine here;
 * this check only guards against Access leaking onto this Worker.
 *
 * The Location is matched on its host via `isAccessLoginLocation`, not by substring:
 * a redirect to our own site carrying "cloudflareaccess.com" in a query parameter is
 * not an Access login, and reporting it as a security failure would fail the deploy
 * over nothing.
 */
export function checkNeverExposedToAccess(
  name: string,
  status: number,
  location: string | null,
): CheckResult {
  if (status === 403) {
    return fail(
      name,
      'SECURITY: redirect Worker returned 403 — Access has been applied to the public Worker',
    )
  }
  if (status >= 300 && status < 400 && location !== null && isAccessLoginLocation(location)) {
    return fail(
      name,
      `SECURITY: redirected to an Access login (${location}) — Access has been applied to the public Worker`,
    )
  }

  return pass(name, `${status}${location ? ` -> ${location}` : ''}`)
}

/** Totals a run's results; only zero FAILs and zero ERRORs count as a clean run. */
export function summarize(results: CheckResult[]): {
  passed: number
  failed: number
  errored: number
  ok: boolean
} {
  const passed = results.filter(result => result.status === 'PASS').length
  const failed = results.filter(result => result.status === 'FAIL').length
  const errored = results.filter(result => result.status === 'ERROR').length
  return { passed, failed, errored, ok: failed === 0 && errored === 0 }
}

export interface LinkExpectation {
  slug: string
  url: string
}

/**
 * Pulls the slug and url straight out of each link file, independent of the generated
 * bundle the redirect Worker actually serves (src/links.generated.ts) — so this proves
 * the deployed Worker against the same source of truth a reviewer would read by hand,
 * not against the Worker's own build output.
 */
export function expectedRedirects(files: LinkFile[]): LinkExpectation[] {
  return files.map((file) => {
    const data = JSON.parse(file.content) as { slug: string, url: string }
    return { slug: data.slug, url: data.url }
  })
}

function base64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

/** Not shaped like a JWT at all — the crudest forgery. */
export function buildJunkAccessToken(): string {
  return 'not-a-jwt-just-junk'
}

/**
 * A syntactically well-formed, three-segment JWT claiming a real algorithm (RS256) but
 * signed with nothing Cloudflare's JWKS would recognise. This is what the deleted
 * verifier's JWKS-fail-open defect (see D21) would have admitted; the edge must not.
 */
export function buildUnsignedAccessToken(): string {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64Url(JSON.stringify({ email: 'attacker@example.com', aud: ['forged'] }))
  const signature = base64Url('not-a-real-signature')
  return `${header}.${payload}.${signature}`
}

/** The classic `alg: none` forgery: a valid header and payload with no signature at all. */
export function buildAlgNoneAccessToken(): string {
  const header = base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const payload = base64Url(JSON.stringify({ email: 'attacker@example.com', aud: ['forged'] }))
  return `${header}.${payload}.`
}

interface FetchOutcome {
  status: number
  location: string | null
  cacheControl: string | null
  bodyText: string
}

type FetchResult = { ok: true, result: FetchOutcome } | { ok: false, errorMessage: string }

/**
 * Fetches with a manual redirect policy — Node's fetch (undici) exposes the real
 * status and headers on a manual-redirect response, unlike a browser's opaque one — and
 * a per-request timeout, so a hung endpoint fails this check rather than hanging CI.
 * Network failures (DNS, timeout, connection refused) are reported as their own
 * outcome, never silently folded into a PASS or a FAIL: a request that could not be
 * made proves nothing about the assertion it was meant to make.
 */
async function fetchSafely(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<FetchResult> {
  try {
    const response = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    const bodyText = await response.text()
    return {
      ok: true,
      result: {
        status: response.status,
        location: response.headers.get('location'),
        cacheControl: response.headers.get('cache-control'),
        bodyText,
      },
    }
  }
  catch (err) {
    return { ok: false, errorMessage: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Checks one admin-Worker request: refused — either a `403` or a login redirect to
 * `cloudflareaccess.com`, loudly not-200 — no-store, and no leaked statistics content.
 * `headers` carries a forged `Cf-Access-Jwt-Assertion` when present; a bare request
 * otherwise. A failed fetch reports a single ERROR rather than three, since none of the
 * three assertions could actually be evaluated. Also returns the raw status/location
 * outcome (or null on a failed fetch), so the caller can feed it into the
 * once-per-run `checkAccessWiredUp` assertion.
 */
async function checkAdminRequest(
  baseUrl: string,
  path: string,
  label: string,
  slugs: string[],
  headers: Record<string, string> | undefined,
  timeoutMs: number,
): Promise<{ results: CheckResult[], outcome: AdminOutcome | null }> {
  const outcome = await fetchSafely(`${baseUrl}${path}`, { headers }, timeoutMs)
  if (!outcome.ok)
    return { results: [error(`${label}: request failed`, outcome.errorMessage)], outcome: null }

  const { status, location, cacheControl, bodyText } = outcome.result
  return {
    results: [
      checkAdminRefused(`${label}: refused`, status, location),
      checkNoStore(`${label}: no-store`, cacheControl),
      checkBodyExcludesStatistics(`${label}: no leaked content`, bodyText, slugs),
    ],
    outcome: { status, location },
  }
}

/**
 * Checks one redirect-Worker request: never Access-gated (the loudest possible
 * failure), the expected status, and — when given — the expected `Location`. A failed
 * fetch reports a single ERROR.
 */
async function checkRedirectRequest(
  baseUrl: string,
  path: string,
  label: string,
  expectedStatus: number,
  expectedLocation: string | null,
  timeoutMs: number,
): Promise<CheckResult[]> {
  const outcome = await fetchSafely(`${baseUrl}${path}`, {}, timeoutMs)
  if (!outcome.ok)
    return [error(`${label}: request failed`, outcome.errorMessage)]

  const { status, location } = outcome.result
  const results = [
    checkNeverExposedToAccess(`${label}: not Access-gated`, status, location),
    checkStatus(`${label}: status`, expectedStatus, status),
  ]
  if (expectedLocation !== null)
    results.push(checkLocation(`${label}: Location`, expectedLocation, location))
  return results
}

export async function runAdminChecks(
  adminBaseUrl: string,
  slugs: string[],
  timeoutMs: number,
): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const outcomes: AdminOutcome[] = []

  const paths: Array<[path: string, label: string]> = [
    ['/', 'admin GET /'],
    ['/admin', 'admin GET /admin'],
    ['/admin/', 'admin GET /admin/'],
    ['/admin/deep/nested/path', 'admin GET /admin/deep/nested/path'],
    ['/favicon.ico', 'admin GET /favicon.ico'],
    ['/admin?days=7', 'admin GET /admin?days=7'],
  ]
  for (const [path, label] of paths) {
    const { results: pathResults, outcome } = await checkAdminRequest(
      adminBaseUrl,
      path,
      label,
      slugs,
      undefined,
      timeoutMs,
    )
    results.push(...pathResults)
    if (outcome !== null)
      outcomes.push(outcome)
  }

  const forgedTokens: Array<[token: string, label: string]> = [
    [buildJunkAccessToken(), 'admin GET /admin with junk Cf-Access-Jwt-Assertion'],
    [buildUnsignedAccessToken(), 'admin GET /admin with unsigned Cf-Access-Jwt-Assertion'],
    [buildAlgNoneAccessToken(), 'admin GET /admin with alg:none Cf-Access-Jwt-Assertion'],
  ]
  for (const [token, label] of forgedTokens) {
    const { results: tokenResults, outcome } = await checkAdminRequest(
      adminBaseUrl,
      '/admin',
      label,
      slugs,
      { 'Cf-Access-Jwt-Assertion': token },
      timeoutMs,
    )
    results.push(...tokenResults)
    if (outcome !== null)
      outcomes.push(outcome)
  }

  results.push(checkAccessWiredUp('Access is actually wired up', outcomes))

  return results
}

async function runRedirectChecks(
  redirectBaseUrl: string,
  links: LinkExpectation[],
  timeoutMs: number,
): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  for (const link of links) {
    results.push(
      ...(await checkRedirectRequest(
        redirectBaseUrl,
        `/${link.slug}`,
        `redirect GET /${link.slug}`,
        301,
        link.url,
        timeoutMs,
      )),
    )
  }

  const [firstLink] = links
  if (firstLink) {
    results.push(
      ...(await checkRedirectRequest(
        redirectBaseUrl,
        `/${firstLink.slug.toUpperCase()}`,
        `redirect GET /${firstLink.slug.toUpperCase()} (mixed case resolves like /${firstLink.slug})`,
        301,
        firstLink.url,
        timeoutMs,
      )),
    )
    results.push(
      ...(await checkRedirectRequest(
        redirectBaseUrl,
        `/${firstLink.slug}/`,
        `redirect GET /${firstLink.slug}/ (trailing slash resolves like /${firstLink.slug})`,
        301,
        firstLink.url,
        timeoutMs,
      )),
    )
    results.push(
      ...(await checkRedirectRequest(
        redirectBaseUrl,
        `//${firstLink.slug}`,
        `redirect GET //${firstLink.slug} (doubled slash)`,
        404,
        null,
        timeoutMs,
      )),
    )
    results.push(
      ...(await checkRedirectRequest(
        redirectBaseUrl,
        `/${firstLink.slug}?foo=bar`,
        `redirect GET /${firstLink.slug}?foo=bar (no query forwarded)`,
        301,
        firstLink.url,
        timeoutMs,
      )),
    )
  }

  results.push(
    ...(await checkRedirectRequest(
      redirectBaseUrl,
      '/',
      'redirect GET / (home)',
      302,
      HOME_URL,
      timeoutMs,
    )),
  )
  results.push(
    ...(await checkRedirectRequest(
      redirectBaseUrl,
      '/admin',
      'redirect GET /admin (gate must stay gone)',
      404,
      null,
      timeoutMs,
    )),
  )
  results.push(
    ...(await checkRedirectRequest(
      redirectBaseUrl,
      '/admin/stats',
      'redirect GET /admin/stats (gate must stay gone)',
      404,
      null,
      timeoutMs,
    )),
  )

  return results
}

function printResults(heading: string, results: CheckResult[]): void {
  console.log(`\n${heading}`)
  for (const result of results)
    console.log(`  [${result.status}] ${result.name} — ${result.detail}`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const redirectBaseUrl = (args[0] ?? DEFAULT_REDIRECT_BASE_URL).replace(/\/$/, '')
  const adminBaseUrl = (args[1] ?? DEFAULT_ADMIN_BASE_URL).replace(/\/$/, '')

  const linksDir = fileURLToPath(new URL('../links', import.meta.url))
  const files = readLinkFiles(linksDir)
  const links = expectedRedirects(files)
  const slugs = links.map(link => link.slug)

  const adminResults = await runAdminChecks(adminBaseUrl, slugs, REQUEST_TIMEOUT_MS)
  printResults(`Admin Worker (${adminBaseUrl})`, adminResults)

  const redirectResults = await runRedirectChecks(redirectBaseUrl, links, REQUEST_TIMEOUT_MS)
  printResults(`Redirect Worker (${redirectBaseUrl})`, redirectResults)

  const allResults = [...adminResults, ...redirectResults]
  const summary = summarize(allResults)
  console.log(
    `\n${summary.passed} passed, ${summary.failed} failed, ${summary.errored} errored (${allResults.length} total)`,
  )

  process.exitCode = summary.ok ? 0 : 1
}

if (import.meta.main)
  await main()
