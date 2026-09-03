import type { LinkFile } from './validate-links.ts'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  findTargetChanges,
  formatTargetChangeComment,
  readLinkFiles,
  validateLinkFiles,
} from './validate-links.ts'

function link(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    url: 'https://www.symprex.com/careers',
    slug: 'careers',
    comment: 'Symprex careers page',
    ...overrides,
  })
}

describe('validateLinkFiles', () => {
  it('accepts a well-formed link', () => {
    const errors = validateLinkFiles([{ filename: 'careers.json', content: link() }])
    expect(errors).toEqual([])
  })

  it('rejects a slug that does not match the slug regex', () => {
    const errors = validateLinkFiles([
      { filename: 'Bad_Slug.json', content: link({ slug: 'Bad_Slug' }) },
    ])
    expect(errors).toEqual([
      'Bad_Slug.json: slug "Bad_Slug" does not match /^[a-z0-9]+(?:-[a-z0-9]+)*$/',
    ])
  })

  it('rejects a filename that does not match the slug field', () => {
    const errors = validateLinkFiles([
      { filename: 'careers2.json', content: link({ slug: 'careers' }) },
    ])
    expect(errors).toEqual([
      'careers2.json: filename "careers2.json" does not match slug "careers"',
    ])
  })

  it('rejects the reserved slug "admin"', () => {
    const errors = validateLinkFiles([
      { filename: 'admin.json', content: link({ slug: 'admin' }) },
    ])
    expect(errors).toEqual(['admin.json: slug "admin" is reserved'])
  })

  it('rejects two files whose slugs differ only in case as a collision', () => {
    // The slug regex already forbids uppercase, so the second file also fails
    // that check — but the duplicate is a separate, real problem: the
    // router's lookup is case-insensitive, so it collides with the first
    // file regardless.
    const errors = validateLinkFiles([
      { filename: 'careers.json', content: link({ slug: 'careers' }) },
      { filename: 'Careers.json', content: link({ slug: 'Careers' }) },
    ])
    expect(errors).toEqual([
      'Careers.json: slug "Careers" does not match /^[a-z0-9]+(?:-[a-z0-9]+)*$/',
      'Careers.json: slug "Careers" duplicates careers.json',
    ])
  })

  it('rejects invalid JSON, naming the file', () => {
    const errors = validateLinkFiles([{ filename: 'broken.json', content: '{ not json' }])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^broken\.json: invalid JSON/)
  })

  it('rejects a field that is not in the documented schema', () => {
    const errors = validateLinkFiles([
      { filename: 'careers.json', content: link({ title: 'Careers' }) },
    ])
    expect(errors).toEqual(['careers.json: unexpected field "title"'])
  })

  it('rejects a missing required field', () => {
    const content = JSON.stringify({ slug: 'careers' })
    const errors = validateLinkFiles([{ filename: 'careers.json', content }])
    expect(errors).toEqual([
      'careers.json: field "url" is required and must be a non-empty string',
    ])
  })

  // These three came from the Sink fork's KV schema and are read by nothing here:
  // analytics indexes by slug (src/analytics.ts, D14), and git records creation and
  // modification more accurately than a hand-edited timestamp ever did. They are
  // rejected rather than merely ignored, so a file copied from an old branch — or
  // exported from the live KV namespace by the cutover script — fails CI instead of
  // silently carrying a dead field back in.
  it.each([
    ['id', 'kfde65bxsc'],
    ['createdAt', 1735689600],
    ['updatedAt', 1735689600],
  ])('rejects the retired Sink field "%s"', (field, value) => {
    const errors = validateLinkFiles([
      { filename: 'careers.json', content: link({ [field]: value }) },
    ])
    expect(errors).toEqual([`careers.json: unexpected field "${field}"`])
  })

  it('reports every problem in a file, not just the first', () => {
    const errors = validateLinkFiles([
      { filename: 'admin.json', content: link({ slug: 'Admin' }) },
    ])
    expect(errors).toEqual([
      'admin.json: slug "Admin" does not match /^[a-z0-9]+(?:-[a-z0-9]+)*$/',
      'admin.json: slug "Admin" is reserved',
      'admin.json: filename "admin.json" does not match slug "Admin"',
    ])
  })
})

describe('the current links/ directory', () => {
  it('has no validation problems', () => {
    const dir = fileURLToPath(new URL('../links', import.meta.url))
    const files = readLinkFiles(dir)
    expect(files.length).toBeGreaterThan(0)
    expect(validateLinkFiles(files)).toEqual([])
  })
})

describe('findTargetChanges', () => {
  it('reports a slug whose url changed', () => {
    const before: LinkFile[] = [
      { filename: 'links/careers.json', content: link({ url: 'https://old.example.com/careers' }) },
    ]
    const after: LinkFile[] = [
      { filename: 'links/careers.json', content: link({ url: 'https://new.example.com/careers' }) },
    ]
    expect(findTargetChanges(before, after)).toEqual([
      {
        slug: 'careers',
        oldUrl: 'https://old.example.com/careers',
        newUrl: 'https://new.example.com/careers',
      },
    ])
  })

  it('ignores a file that is only added', () => {
    const before: LinkFile[] = []
    const after: LinkFile[] = [{ filename: 'links/careers.json', content: link() }]
    expect(findTargetChanges(before, after)).toEqual([])
  })

  it('ignores a file that is only deleted', () => {
    const before: LinkFile[] = [{ filename: 'links/careers.json', content: link() }]
    const after: LinkFile[] = []
    expect(findTargetChanges(before, after)).toEqual([])
  })

  it('ignores a file whose url is unchanged', () => {
    const before: LinkFile[] = [{ filename: 'links/careers.json', content: link() }]
    const after: LinkFile[] = [
      { filename: 'links/careers.json', content: link({ comment: 'Updated note' }) },
    ]
    expect(findTargetChanges(before, after)).toEqual([])
  })

  it('reports several changed targets from one comparison', () => {
    const before: LinkFile[] = [
      {
        filename: 'links/careers.json',
        content: link({ slug: 'careers', url: 'https://old-a.example.com' }),
      },
      {
        filename: 'links/jobs.json',
        content: link({ slug: 'jobs', url: 'https://old-b.example.com' }),
      },
    ]
    const after: LinkFile[] = [
      {
        filename: 'links/careers.json',
        content: link({ slug: 'careers', url: 'https://new-a.example.com' }),
      },
      {
        filename: 'links/jobs.json',
        content: link({ slug: 'jobs', url: 'https://new-b.example.com' }),
      },
    ]
    expect(findTargetChanges(before, after)).toEqual([
      { slug: 'careers', oldUrl: 'https://old-a.example.com', newUrl: 'https://new-a.example.com' },
      { slug: 'jobs', oldUrl: 'https://old-b.example.com', newUrl: 'https://new-b.example.com' },
    ])
  })

  describe('when read from directories with different basenames', () => {
    // A real workflow run checks the merge base out to one temp directory and
    // reads the PR head from another — nothing guarantees the two share a
    // basename. readLinkFiles embeds the directory's basename in each file's
    // `filename`, so if findTargetChanges joined on that filename it would
    // never match a file across two differently-named directories, and would
    // silently report zero changes instead of failing loudly.
    let baseDir: string
    let headDir: string

    afterEach(() => {
      rmSync(baseDir, { recursive: true, force: true })
      rmSync(headDir, { recursive: true, force: true })
    })

    it('still finds a changed target', () => {
      baseDir = mkdtempSync(join(tmpdir(), 'validate-links-base-'))
      headDir = mkdtempSync(join(tmpdir(), 'validate-links-head-'))
      writeFileSync(
        join(baseDir, 'careers.json'),
        link({ url: 'https://old.example.com/careers' }),
      )
      writeFileSync(
        join(headDir, 'careers.json'),
        link({ url: 'https://new.example.com/careers' }),
      )

      const before = readLinkFiles(baseDir)
      const after = readLinkFiles(headDir)

      expect(findTargetChanges(before, after)).toEqual([
        {
          slug: 'careers',
          oldUrl: 'https://old.example.com/careers',
          newUrl: 'https://new.example.com/careers',
        },
      ])
    })
  })
})

describe('formatTargetChangeComment', () => {
  it('returns null when there are no changes', () => {
    expect(formatTargetChangeComment([])).toBeNull()
  })

  it('names the old and new target for a changed slug', () => {
    const comment = formatTargetChangeComment([
      { slug: 'careers', oldUrl: 'https://old.example.com', newUrl: 'https://new.example.com' },
    ])
    expect(comment).toContain('careers')
    expect(comment).toContain('https://old.example.com')
    expect(comment).toContain('https://new.example.com')
  })

  it('lists several changed targets in one comment', () => {
    const comment = formatTargetChangeComment([
      { slug: 'careers', oldUrl: 'https://old-a.example.com', newUrl: 'https://new-a.example.com' },
      { slug: 'jobs', oldUrl: 'https://old-b.example.com', newUrl: 'https://new-b.example.com' },
    ])
    expect(comment).toContain('careers')
    expect(comment).toContain('jobs')
  })
})
