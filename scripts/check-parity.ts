import type { KvDump } from './export-kv-links.ts'
// Proves the new redirect Worker answers every live link exactly as the legacy Sink site
// does, before go.symprex.com is cut over (#91). Engineer-run, not in CI: it compares two
// live hosts, and the legacy one stops existing at cutover.
//
// For every probe path it requests both hosts with a manual redirect policy and compares
// the status and, for a redirect, the exact Location. It never compares either side with
// links/ — verify-deployment.ts already does that — so a difference here is a behaviour
// difference between the two sites, which is the only thing the cutover can break.
//
// Runs with plain `node`, same as verify-deployment.ts, whose result types it reuses.
import type { CheckResult } from './verify-deployment.ts'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { readLinkFiles } from './validate-links.ts'
import { expectedRedirects, summarize } from './verify-deployment.ts'

const DEFAULT_LEGACY_BASE_URL = 'https://go.symprex.com'
const DEFAULT_CANDIDATE_BASE_URL = 'https://link-shortener-redirect.sig365.workers.dev'
const REQUEST_TIMEOUT_MS = 10_000
const CONCURRENCY = 8
const UNKNOWN_SLUG = 'parity-check-unknown-slug'

export interface Outcome {
  status: number
  location: string | null
}

function describe(outcome: Outcome): string {
  return outcome.location === null ? `${outcome.status}` : `${outcome.status} -> ${outcome.location}`
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}

/**
 * Same status, and for a redirect the byte-identical Location. A non-redirect's Location
 * is not part of either site's contract, so it is not compared — only whether both
 * answered, say, 404.
 */
export function compareOutcomes(path: string, legacy: Outcome, candidate: Outcome): CheckResult {
  const same = legacy.status === candidate.status
    && (!isRedirect(legacy.status) || legacy.location === candidate.location)
  return same
    ? { name: path, status: 'PASS', detail: describe(legacy) }
    : { name: path, status: 'FAIL', detail: `legacy ${describe(legacy)}, new ${describe(candidate)}` }
}

/**
 * Every slug in links/, then one of each behaviour the redirect contract fixes —
 * case-folding, a trailing slash, a query string that must not be forwarded — on the
 * first slug, the root, and a slug neither site has. Then each original KV key as it was
 * spelt, when it differs from what links/ holds: a key that was lowercased should still
 * match, and one that was withheld will fail, which is the evidence it was withheld.
 */
export function buildProbes(slugs: string[], kvSlugs: string[]): string[] {
  const probes = slugs.map(slug => `/${slug}`)
  const [first] = slugs
  if (first !== undefined)
    probes.push(`/${first.toUpperCase()}`, `/${first}/`, `/${first}?utm_source=parity`)
  probes.push('/', `/${UNKNOWN_SLUG}`)

  const known = new Set(slugs)
  for (const slug of kvSlugs) {
    if (!known.has(slug) && !probes.includes(`/${slug}`))
      probes.push(`/${slug}`)
  }
  return probes
}

async function fetchOutcome(url: string): Promise<Outcome | string> {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    await response.body?.cancel()
    return { status: response.status, location: response.headers.get('location') }
  }
  catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

async function checkProbe(path: string, legacyBase: string, candidateBase: string): Promise<CheckResult> {
  const [legacy, candidate] = await Promise.all([
    fetchOutcome(`${legacyBase}${path}`),
    fetchOutcome(`${candidateBase}${path}`),
  ])
  if (typeof legacy === 'string')
    return { name: path, status: 'ERROR', detail: `legacy request failed: ${legacy}` }
  if (typeof candidate === 'string')
    return { name: path, status: 'ERROR', detail: `new request failed: ${candidate}` }
  return compareOutcomes(path, legacy, candidate)
}

async function main(): Promise<void> {
  const { values: options } = parseArgs({
    options: {
      legacy: { type: 'string', default: DEFAULT_LEGACY_BASE_URL },
      candidate: { type: 'string', default: DEFAULT_CANDIDATE_BASE_URL },
      dump: { type: 'string' },
    },
  })
  const legacyBase = options.legacy.replace(/\/$/, '')
  const candidateBase = options.candidate.replace(/\/$/, '')

  const linksDir = fileURLToPath(new URL('../links', import.meta.url))
  const slugs = expectedRedirects(readLinkFiles(linksDir)).map(link => link.slug)
  const kvSlugs = options.dump
    ? (JSON.parse(readFileSync(options.dump, 'utf8')) as KvDump).records.filter(record => record.key.startsWith('link:')).map(record => record.key.slice('link:'.length))
    : []

  const probes = buildProbes(slugs, kvSlugs)
  const results: CheckResult[] = []
  for (let index = 0; index < probes.length; index += CONCURRENCY) {
    results.push(...await Promise.all(
      probes.slice(index, index + CONCURRENCY).map(path => checkProbe(path, legacyBase, candidateBase)),
    ))
  }

  console.log(`Parity: ${legacyBase} (legacy) vs ${candidateBase} (new), ${probes.length} paths\n`)
  for (const result of results)
    console.log(`  [${result.status}] ${result.name} — ${result.detail}`)

  const summary = summarize(results)
  console.log(`\n${summary.passed} passed, ${summary.failed} failed, ${summary.errored} errored`)
  process.exitCode = summary.ok ? 0 : 1
}

if (import.meta.main)
  await main()
