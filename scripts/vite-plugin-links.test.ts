import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  invalidateVirtualLinks,
  isLinkFilePath,
  linksModuleSource,
  loadVirtualLinks,
  resolveVirtualLinks,
  VIRTUAL_LINKS_ID,
  VIRTUAL_LINKS_SPECIFIER,
  vitePluginLinks,
} from './vite-plugin-links.ts'

function linksDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'vite-plugin-links-'))
  for (const [name, body] of Object.entries(files))
    writeFileSync(join(dir, name), JSON.stringify(body))
  return dir
}

const careers = {
  url: 'https://www.symprex.com/careers',
  slug: 'careers',
  comment: 'Symprex careers page',
}

describe('linksModuleSource', () => {
  it('emits a slug-keyed map with no type import, so the module stands alone', () => {
    const source = linksModuleSource(linksDir({ 'careers.json': careers }))
    expect(source).not.toMatch(/import/)
    expect(source).toContain('export const links =')
  })

  it('keys the map by slug and carries the link through unchanged', async () => {
    const source = linksModuleSource(linksDir({ 'careers.json': careers }))
    const { links } = await import(`data:text/javascript,${encodeURIComponent(source)}`)
    expect(links).toEqual({ careers })
  })

  // The whole point of the virtual module over the generated file: an invalid link
  // stops the build at the point the module is loaded, rather than being written to
  // disk by a script the deploy has to remember to run first.
  it('throws, naming every problem, rather than emitting a module', () => {
    const dir = linksDir({ 'Bad_Slug.json': { url: 'https://x/y', slug: 'Bad_Slug' } })
    expect(() => linksModuleSource(dir)).toThrow(/Bad_Slug/)
  })

  it('throws on a retired Sink field rather than passing it through', () => {
    const dir = linksDir({ 'careers.json': { ...careers, id: 'kfde65bxsc' } })
    expect(() => linksModuleSource(dir)).toThrow(/unexpected field "id"/)
  })

  it('emits an empty map for an empty directory rather than failing', () => {
    expect(linksModuleSource(linksDir({}))).toContain('export const links = {}')
  })
})

describe('the plugin hooks', () => {
  it('resolves the virtual specifier to its own opaque id', () => {
    expect(resolveVirtualLinks(VIRTUAL_LINKS_SPECIFIER)).toBe(VIRTUAL_LINKS_ID)
  })

  it('does not resolve anything else, including the resolved id itself', () => {
    expect(resolveVirtualLinks('./types.ts')).toBeUndefined()
    expect(resolveVirtualLinks(VIRTUAL_LINKS_ID)).toBeUndefined()
  })

  it('loads the module source for its own id only', () => {
    const dir = linksDir({ 'careers.json': careers })
    expect(loadVirtualLinks(VIRTUAL_LINKS_ID, dir)).toContain('careers')
    expect(loadVirtualLinks(VIRTUAL_LINKS_SPECIFIER, dir)).toBeUndefined()
    expect(loadVirtualLinks('src/index.ts', dir)).toBeUndefined()
  })

  it('reads the directory on every load, so an edited link file is picked up', () => {
    const dir = linksDir({ 'careers.json': careers })
    expect(loadVirtualLinks(VIRTUAL_LINKS_ID, dir)).not.toContain('jobs')
    writeFileSync(join(dir, 'jobs.json'), JSON.stringify({ url: 'https://x/j', slug: 'jobs' }))
    expect(loadVirtualLinks(VIRTUAL_LINKS_ID, dir)).toContain('jobs')
  })

  it('names itself, so a build error says which plugin refused', () => {
    expect(vitePluginLinks({ sourceDir: linksDir({}) }).name).toBe('symprex:links')
  })
})

describe('isLinkFilePath', () => {
  it('accepts a .json file directly inside the source directory', () => {
    expect(isLinkFilePath(join('/links', 'careers.json'), '/links')).toBe(true)
  })

  // The watcher is registered on the directory, so it reports everything beneath it.
  // Reacting to the wrong file means invalidating on every unrelated save.
  it.each([
    ['a non-json file', join('/links', 'README.md')],
    ['a file outside the directory', join('/elsewhere', 'careers.json')],
    ['a json file in a subdirectory', join('/links', 'nested', 'careers.json')],
  ])('rejects %s', (_label, path) => {
    expect(isLinkFilePath(path, '/links')).toBe(false)
  })
})

describe('invalidateVirtualLinks', () => {
  interface FakeModule { id: string }

  function fakeEnvironment(hasModule: boolean) {
    const invalidated: FakeModule[] = []
    return {
      invalidated,
      environment: {
        moduleGraph: {
          getModuleById: (id: string) =>
            hasModule && id === VIRTUAL_LINKS_ID ? { id } : undefined,
          invalidateModule: (mod: FakeModule) => invalidated.push(mod),
        },
      },
    }
  }

  it('invalidates the virtual module in every environment that has it', () => {
    const first = fakeEnvironment(true)
    const second = fakeEnvironment(true)
    invalidateVirtualLinks([first.environment, second.environment])
    expect(first.invalidated).toEqual([{ id: VIRTUAL_LINKS_ID }])
    expect(second.invalidated).toEqual([{ id: VIRTUAL_LINKS_ID }])
  })

  it('leaves an environment that has never loaded the module alone', () => {
    const untouched = fakeEnvironment(false)
    invalidateVirtualLinks([untouched.environment])
    expect(untouched.invalidated).toEqual([])
  })

  it('tolerates an environment with no module graph', () => {
    expect(() => invalidateVirtualLinks([{}, undefined])).not.toThrow()
  })
})
