// One-off export of the live link set out of the Sink fork's KV namespace into
// links/<slug>.json (#91). Engineer-run, never in CI: it needs read access to the
// production namespace, which only a person signed in to the Symprex account holds.
//
// Two stages, so the network and the decisions are separable:
//
//   1. Fetch — `wrangler kv key list` and `wrangler kv bulk get` against the live
//      namespace, written verbatim to a raw dump file. The dump keeps every record's
//      `id`, which is the only id -> slug mapping for the legacy Analytics Engine
//      dataset (`link-shortener`, indexed by id) once KV is gone.
//   2. Plan — reduce each record to the three-field format docs/links.md documents,
//      write links/<slug>.json, and list everything that needs a person's decision
//      rather than guessing. `--from <dump>` re-runs this stage alone, offline.
//
// Runs with plain `node`, same as validate-links.ts. Wrangler is driven as a child
// process so it supplies the credentials (`wrangler login`); this script never sees one.
import type { LinkFile } from './validate-links.ts'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { readLinkFiles, RESERVED_SLUGS, SLUG_REGEX } from './validate-links.ts'

// The legacy wrangler.jsonc's KV binding, and the account wrangler.worker.jsonc deploys to.
// The account is pinned rather than inherited from whichever account `wrangler login`
// defaults to, because reading the right namespace on the wrong account fails with a
// "namespace not found" that does not say which account it looked in.
const NAMESPACE_ID = 'f0678621d8f849fbaff4bd9b5618dab9'
const ACCOUNT_ID = '93686db668e1fd06177661df08f7c0cd'
const KEY_PREFIX = 'link:'
// The KV bulk read API's per-request limit; wrangler passes the list straight through.
const BULK_GET_LIMIT = 100

/** One KV entry as the dump records it: the raw value text, untouched. */
export interface KvRecord {
  key: string
  value: string | null
  expiration?: number
  metadata?: unknown
}

export interface KvDump {
  exportedAt: string
  accountId: string
  namespaceId: string
  records: KvRecord[]
}

export interface ExportedLink {
  url: string
  slug: string
  comment?: string
}

export type IssueKind
  = | 'invalid-value'
    | 'slug-mismatch'
    | 'lowercased'
    | 'case-collision'
    | 'invalid-slug'
    | 'reserved-slug'
    | 'expires'
    | 'expired'
    | 'dropped-fields'
    | 'url-changed'
    | 'not-in-kv'

/** `blocking` means a person has to decide before the export can ship — never a guess. */
export interface ExportIssue {
  kind: IssueKind
  key: string
  blocking: boolean
  detail: string
}

export interface ExportPlan {
  links: ExportedLink[]
  issues: ExportIssue[]
}

// Fields LinkSchema (schemas/link.ts) carries that the new format has nowhere to put.
// `id`, `createdAt` and `updatedAt` are on every record and are dropped silently — the
// dump keeps them. These three are reported, because someone typed them in.
const REPORTED_DROPPED_FIELDS = ['title', 'description', 'image'] as const

function isoFromEpochSeconds(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

/**
 * Reduces raw KV records to the link files to write and the issues to report. Pure: no
 * filesystem, no network, `now` passed in, so every decision it makes is unit-tested.
 *
 * The slug comes from the KV key, not the value, because the key is what the legacy
 * middleware looks up (`KV.get(\`link:${slug}\`)`). It is lowercased, which the new
 * Worker makes lossless: it lowercases the request path before lookup, so `/Teams-Help`
 * still resolves. Two keys that lowercase to the same slug are both withheld — choosing
 * one would silently retarget the other.
 */
export function planExport(records: KvRecord[], now: number): ExportPlan {
  const issues: ExportIssue[] = []
  const candidates: Array<{ key: string, link: ExportedLink }> = []

  for (const record of records) {
    if (!record.key.startsWith(KEY_PREFIX))
      continue

    const key = record.key
    const keySlug = key.slice(KEY_PREFIX.length)

    let value: Record<string, unknown>
    try {
      const parsed: unknown = record.value === null ? null : JSON.parse(record.value)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('not a JSON object')
      value = parsed as Record<string, unknown>
    }
    catch (err) {
      const reason = record.value === null ? 'no value returned' : (err as Error).message
      issues.push({ kind: 'invalid-value', key, blocking: true, detail: reason })
      continue
    }

    if (typeof value.url !== 'string' || value.url.trim() === '') {
      issues.push({ kind: 'invalid-value', key, blocking: true, detail: 'no url' })
      continue
    }

    if (typeof value.slug === 'string' && value.slug !== keySlug) {
      issues.push({ kind: 'slug-mismatch', key, blocking: false, detail: `value.slug is "${value.slug}"; the key wins` })
    }

    const slug = keySlug.toLowerCase()

    if (RESERVED_SLUGS.has(slug)) {
      issues.push({ kind: 'reserved-slug', key, blocking: true, detail: `"${slug}" is reserved for the statistics page; rename it or drop it` })
      continue
    }

    if (!SLUG_REGEX.test(slug)) {
      issues.push({ kind: 'invalid-slug', key, blocking: true, detail: `"${slug}" does not match ${SLUG_REGEX}; rename it or widen the regex` })
      continue
    }

    // The KV TTL and the value's own field are written together by the legacy create
    // handler, but either can exist alone (an edit, or a record written by hand).
    const expiration = record.expiration ?? (typeof value.expiration === 'number' ? value.expiration : undefined)
    if (expiration !== undefined) {
      if (expiration <= now) {
        issues.push({ kind: 'expired', key, blocking: true, detail: `expired ${isoFromEpochSeconds(expiration)} but is still in KV, so still served today; not written` })
        continue
      }
      issues.push({ kind: 'expires', key, blocking: true, detail: `expires ${isoFromEpochSeconds(expiration)}; the new format makes it permanent` })
    }

    if (keySlug !== slug)
      issues.push({ kind: 'lowercased', key, blocking: false, detail: `written as "${slug}"` })

    const dropped = REPORTED_DROPPED_FIELDS.filter(field => typeof value[field] === 'string' && (value[field] as string).trim() !== '')
    if (dropped.length > 0)
      issues.push({ kind: 'dropped-fields', key, blocking: false, detail: dropped.join(', ') })

    const link: ExportedLink = { url: value.url.trim(), slug }
    if (typeof value.comment === 'string' && value.comment.trim() !== '')
      link.comment = value.comment.trim()

    candidates.push({ key, link })
  }

  const keysBySlug = new Map<string, string[]>()
  for (const { key, link } of candidates)
    keysBySlug.set(link.slug, [...(keysBySlug.get(link.slug) ?? []), key])

  const links: ExportedLink[] = []
  for (const { key, link } of candidates) {
    const claimants = keysBySlug.get(link.slug) ?? []
    if (claimants.length > 1) {
      issues.push({
        kind: 'case-collision',
        key,
        blocking: true,
        detail: `"${link.slug}" is claimed by ${[...claimants].sort().join(', ')}; neither is written`,
      })
      continue
    }
    links.push(link)
  }

  links.sort((a, b) => a.slug.localeCompare(b.slug))
  return { links, issues }
}

/**
 * Compares the export against what links/ already holds. KV is the live truth, so a
 * differing target is overwritten and reported; a file KV does not have is a link that
 * is not live today (the PR 1 samples, or one added since), and only a person can say
 * whether it should go live at cutover.
 */
export function compareWithExisting(links: ExportedLink[], existing: LinkFile[]): ExportIssue[] {
  const exported = new Map(links.map(link => [link.slug, link]))
  const issues: ExportIssue[] = []

  for (const file of existing) {
    const current = JSON.parse(file.content) as { slug: string, url: string }
    const fromKv = exported.get(current.slug)
    if (!fromKv)
      issues.push({ kind: 'not-in-kv', key: file.filename, blocking: true, detail: 'not live today; keep it or delete it' })
    else if (fromKv.url !== current.url)
      issues.push({ kind: 'url-changed', key: file.filename, blocking: false, detail: `${current.url} -> ${fromKv.url} (KV wins)` })
  }

  return issues
}

/** The layout of the hand-written files: two-space indent, fields in schema order, trailing newline. */
export function serialiseLink(link: ExportedLink): string {
  const ordered: ExportedLink = { url: link.url, slug: link.slug }
  if (link.comment !== undefined)
    ordered.comment = link.comment
  return `${JSON.stringify(ordered, null, 2)}\n`
}

function wrangler(args: string[]): string {
  // The installed wrangler's own entry point under this Node, rather than `pnpm exec`:
  // on Windows that resolves to pnpm.cmd, which Node only spawns through a shell, and a
  // shell concatenates arguments unescaped (DEP0190).
  const entry = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url))
  return execFileSync(process.execPath, [entry, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

/** Reads every `link:` record from the live namespace. Read-only: list and bulk get. */
function fetchDump(): KvDump {
  const keys = JSON.parse(
    wrangler(['kv', 'key', 'list', '--namespace-id', NAMESPACE_ID, '--prefix', KEY_PREFIX, '--remote']),
  ) as Array<{ name: string, expiration?: number, metadata?: unknown }>

  const scratch = mkdtempSync(join(tmpdir(), 'kv-export-'))
  const values = new Map<string, unknown>()
  try {
    for (let index = 0; index < keys.length; index += BULK_GET_LIMIT) {
      const batchFile = join(scratch, `batch-${index}.json`)
      writeFileSync(batchFile, JSON.stringify(keys.slice(index, index + BULK_GET_LIMIT).map(key => key.name)))
      const batch = JSON.parse(
        wrangler(['kv', 'bulk', 'get', batchFile, '--namespace-id', NAMESPACE_ID, '--remote']),
      ) as Record<string, unknown>
      for (const [name, value] of Object.entries(batch)) values.set(name, value)
      console.error(`Fetched ${Math.min(index + BULK_GET_LIMIT, keys.length)} of ${keys.length}`)
    }
  }
  finally {
    rmSync(scratch, { recursive: true, force: true })
  }

  const records = keys.map((key): KvRecord => {
    const raw = values.get(key.name)
    // The bulk API returns text by default; an object here would mean it parsed the JSON
    // for us, so re-serialise it rather than lose the record.
    const value = raw === undefined || raw === null ? null : typeof raw === 'string' ? raw : JSON.stringify(raw)
    return { key: key.name, value, expiration: key.expiration, metadata: key.metadata }
  })

  return { exportedAt: new Date().toISOString(), accountId: ACCOUNT_ID, namespaceId: NAMESPACE_ID, records }
}

function printIssues(issues: ExportIssue[]): void {
  const order = (issue: ExportIssue) => (issue.blocking ? 0 : 1)
  for (const issue of [...issues].sort((a, b) => order(a) - order(b) || a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key)))
    console.log(`  [${issue.blocking ? 'DECIDE' : 'note'}] ${issue.kind} ${issue.key} — ${issue.detail}`)
}

function main(): void {
  const { values: options } = parseArgs({
    options: {
      dump: { type: 'string' },
      from: { type: 'string' },
    },
  })

  if (!options.dump && !options.from) {
    console.error('Usage: node scripts/export-kv-links.ts --dump <raw-dump.json>   (fetch from KV, then write links/)')
    console.error('       node scripts/export-kv-links.ts --from <raw-dump.json>   (re-plan from an earlier dump, offline)')
    console.error('The raw dump holds every live URL and comment: keep it outside the repository unless you have decided to commit it.')
    process.exitCode = 1
    return
  }

  let dump: KvDump
  if (options.from) {
    dump = JSON.parse(readFileSync(options.from, 'utf8')) as KvDump
  }
  else {
    dump = fetchDump()
    writeFileSync(options.dump!, `${JSON.stringify(dump, null, 2)}\n`)
    console.log(`Raw dump of ${dump.records.length} record(s) written to ${options.dump}`)
  }

  const plan = planExport(dump.records, Math.floor(Date.parse(dump.exportedAt) / 1000))
  const linksDir = fileURLToPath(new URL('../links', import.meta.url))
  const issues = [...plan.issues, ...compareWithExisting(plan.links, readLinkFiles(linksDir))]

  for (const link of plan.links)
    writeFileSync(join(linksDir, `${link.slug}.json`), serialiseLink(link))

  console.log(`\n${plan.links.length} link file(s) written to links/ from ${dump.records.length} KV record(s) exported ${dump.exportedAt}.`)
  if (issues.length > 0) {
    console.log(`\n${issues.length} issue(s):`)
    printIssues(issues)
  }

  const blocking = issues.filter(issue => issue.blocking).length
  if (blocking > 0) {
    console.log(`\n${blocking} issue(s) need a decision before this export can ship.`)
    process.exitCode = 1
  }
}

if (import.meta.main)
  main()
