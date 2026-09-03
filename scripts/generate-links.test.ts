// Proves generateLinks refuses to write a bundle from data that would not pass
// validate-links.ts's own schema check — the JSON.parse(...) as Link cast inside
// generateLinksModule is only safe because every file it sees has already been through
// validateLinkFiles.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateLinks, generateLinksModule } from './generate-links.ts'

function link(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: 'kfde65bxsc',
    url: 'https://www.symprex.com/careers',
    slug: 'careers',
    createdAt: 1735689600,
    updatedAt: 1735689600,
    ...overrides,
  })
}

describe('generateLinksModule', () => {
  it('builds a module keyed by slug from valid link files', () => {
    const source = generateLinksModule([{ filename: 'careers.json', content: link() }])
    expect(source).toContain('"careers"')
    expect(source).toContain('https://www.symprex.com/careers')
  })
})

describe('generateLinks', () => {
  let sourceDir: string
  let outFile: string

  beforeEach(() => {
    sourceDir = mkdtempSync(join(tmpdir(), 'generate-links-source-'))
    outFile = join(mkdtempSync(join(tmpdir(), 'generate-links-out-')), 'links.generated.ts')
  })

  afterEach(() => {
    rmSync(sourceDir, { recursive: true, force: true })
  })

  it('writes the generated module for a directory of valid link files', () => {
    writeFileSync(join(sourceDir, 'careers.json'), link())

    generateLinks(sourceDir, outFile)

    expect(readFileSync(outFile, 'utf8')).toContain('"careers"')
  })

  it('refuses to write anything when a file fails validation', () => {
    // A slug that does not match SLUG_REGEX — the exact kind of malformed input
    // validate-links.ts's CI gate exists to catch before it ever reaches the bundle.
    writeFileSync(join(sourceDir, 'Bad_Slug.json'), link({ slug: 'Bad_Slug' }))

    expect(() => generateLinks(sourceDir, outFile)).toThrow(/Bad_Slug/)
    expect(() => readFileSync(outFile, 'utf8')).toThrow()
  })
})
