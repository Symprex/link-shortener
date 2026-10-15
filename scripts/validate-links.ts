// Validates every file in links/ against the schema documented in
// docs/links.md: exactly the documented fields, the slug regex, the filename
// matching the slug, no duplicate slugs, and no reserved slug. The schema is
// deliberately three fields — the slug is the link's only identity, and git
// carries the history that `id`, `createdAt` and `updatedAt` used to
// duplicate, so those three are rejected as unexpected rather than tolerated.
// Runs with plain `node` (no build step, no runtime dependencies) so it can
// run in CI exactly as it runs on a developer's machine.
import { readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface LinkFile {
  filename: string
  content: string
}

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const RESERVED_SLUGS = new Set(['admin'])

const REQUIRED_STRING_FIELDS = ['url', 'slug'] as const
const OPTIONAL_STRING_FIELDS = ['comment'] as const
const ALLOWED_FIELDS = new Set<string>([
  ...REQUIRED_STRING_FIELDS,
  ...OPTIONAL_STRING_FIELDS,
])

/** Reads every `*.json` file in `dir` into the shape `validateLinkFiles` checks. */
export function readLinkFiles(dir: string): LinkFile[] {
  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => ({
      filename: `${basename(dir)}/${name}`,
      content: readFileSync(join(dir, name), 'utf8'),
    }))
}

/** Checks every file against the documented schema and returns every problem found. */
export function validateLinkFiles(files: LinkFile[]): string[] {
  const errors: string[] = []
  const slugOwners = new Map<string, string>()

  for (const file of files) {
    const label = file.filename

    let data: unknown
    try {
      data = JSON.parse(file.content)
    }
    catch (error) {
      errors.push(`${label}: invalid JSON (${(error as Error).message})`)
      continue
    }

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      errors.push(`${label}: must be a JSON object`)
      continue
    }

    const record = data as Record<string, unknown>

    for (const key of Object.keys(record)) {
      if (!ALLOWED_FIELDS.has(key))
        errors.push(`${label}: unexpected field "${key}"`)
    }

    for (const field of REQUIRED_STRING_FIELDS) {
      if (typeof record[field] !== 'string' || record[field] === '')
        errors.push(`${label}: field "${field}" is required and must be a non-empty string`)
    }

    if ('comment' in record && typeof record.comment !== 'string')
      errors.push(`${label}: field "comment" must be a string`)

    const slug = typeof record.slug === 'string' ? record.slug : undefined
    if (slug === undefined)
      continue

    if (!SLUG_REGEX.test(slug))
      errors.push(`${label}: slug "${slug}" does not match ${SLUG_REGEX}`)

    if (RESERVED_SLUGS.has(slug.toLowerCase()))
      errors.push(`${label}: slug "${slug}" is reserved`)

    const expectedBasename = basename(file.filename, extname(file.filename))
    if (expectedBasename !== slug)
      errors.push(`${label}: filename "${basename(file.filename)}" does not match slug "${slug}"`)

    const key = slug.toLowerCase()
    const owner = slugOwners.get(key)
    if (owner)
      errors.push(`${label}: slug "${slug}" duplicates ${owner}`)
    else slugOwners.set(key, label)
  }

  return errors
}

export interface TargetChange {
  slug: string
  oldUrl: string
  newUrl: string
}

/** The marker a workflow can search for to find its own sticky comment and update it in place. */
export const TARGET_CHANGE_MARKER = '<!-- validate-links:target-change -->'

/**
 * Compares two link file sets (typically the merge base and the PR head) and
 * reports every slug whose `url` field differs between them. A file present
 * on only one side — added or deleted — is not a target change and is
 * skipped.
 *
 * Joins on the `slug` field parsed out of each file's content, not on
 * `filename`: `readLinkFiles` embeds the source directory's basename in
 * `filename`, so a filename join would silently find zero matches (and thus
 * zero changes) whenever the "before" and "after" directories happen not to
 * share a basename — exactly the case when a workflow reads the merge base
 * and the PR head from two independently named checkouts.
 */
export function findTargetChanges(before: LinkFile[], after: LinkFile[]): TargetChange[] {
  const beforeBySlug = new Map(
    before.map((file) => {
      const data = JSON.parse(file.content) as { url: string, slug: string }
      return [data.slug, data] as const
    }),
  )
  const changes: TargetChange[] = []

  for (const afterFile of after) {
    const afterData = JSON.parse(afterFile.content) as { url: string, slug: string }
    const beforeData = beforeBySlug.get(afterData.slug)
    if (!beforeData)
      continue

    if (beforeData.url !== afterData.url) {
      changes.push({
        slug: afterData.slug,
        oldUrl: beforeData.url,
        newUrl: afterData.url,
      })
    }
  }

  return changes
}

/** Builds the PR comment body naming every changed target, or `null` when there is nothing to say. */
export function formatTargetChangeComment(changes: TargetChange[]): string | null {
  if (changes.length === 0)
    return null

  const lines = changes.map(
    change => `- \`${change.slug}\`: ${change.oldUrl} → ${change.newUrl}`,
  )

  return [
    TARGET_CHANGE_MARKER,
    '### ⚠️ This pull request changes an existing link\'s target',
    '',
    ...lines,
  ].join('\n')
}

function main() {
  const args = process.argv.slice(2)

  if (args[0] === 'diff') {
    const [, beforeDir, afterDir] = args
    const before = readLinkFiles(beforeDir)
    const after = readLinkFiles(afterDir)
    const comment = formatTargetChangeComment(findTargetChanges(before, after))
    if (comment)
      console.log(comment)
    return
  }

  const dir = fileURLToPath(new URL('../links', import.meta.url))
  const files = readLinkFiles(dir)
  const errors = validateLinkFiles(files)

  if (errors.length > 0) {
    for (const error of errors) console.error(error)
    console.error(`${errors.length} problem(s) found in links/`)
    process.exitCode = 1
  }
  else {
    console.log(`${files.length} link(s) in links/ are valid.`)
  }
}

if (import.meta.main)
  main()
