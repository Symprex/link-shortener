// Serves links/*.json to the redirect Worker as the virtual module `virtual:links`.
//
// This replaces a generated file on disk (src/links.generated.ts). That file was one copy
// of the truth, but it was a copy: gitignored, so `tsc` failed on a checkout that had not
// run the generator; writable, so the test suite's fixture setup overwrote the real one as
// a side effect of running; and produced by a script the deploy had to remember to run
// before bundling. A virtual module has no on-disk existence, so none of those states can
// be reached.
//
// Validation is not reimplemented here. `validateLinkFiles` stays the dependency-free
// function it already was, because .github/workflows/validate-links.yml runs it under
// plain `node` with no install step, and its `diff` mode drives the target-change PR
// comment — neither has anything to do with bundling. This plugin calls it and turns a
// problem into a build failure, so there is one implementation of the schema with two
// callers rather than two that can disagree.
import type { Plugin, ViteDevServer } from 'vite'
import { dirname, extname, resolve } from 'node:path'
import { readLinkFiles, validateLinkFiles } from './validate-links.ts'

/** The specifier the Worker imports. */
export const VIRTUAL_LINKS_SPECIFIER = 'virtual:links'

/**
 * The resolved id. The leading NUL is Rollup's convention for a module no other plugin or
 * resolver should touch, and it keeps the id off the filesystem so Vite never stats it.
 */
export const VIRTUAL_LINKS_ID = `\0${VIRTUAL_LINKS_SPECIFIER}`

/**
 * Reads and validates every link file in `sourceDir` and returns the source of the virtual
 * module: a slug-keyed map, and nothing else.
 *
 * Throws if any file is invalid, which is the point — the caller is Vite, so the throw is a
 * build failure with every problem named, at the moment the Worker's import is resolved.
 * There is no path by which an invalid link file becomes a bundle.
 *
 * The emitted source carries no `import type`: the module has no location on disk for a
 * relative specifier to resolve against. The `Link` type reaches the Worker through the
 * ambient declaration in src/virtual-links.d.ts instead.
 */
export function linksModuleSource(sourceDir: string): string {
  const files = readLinkFiles(sourceDir)

  const errors = validateLinkFiles(files)
  if (errors.length > 0) {
    throw new Error(
      `${errors.length} problem(s) in ${sourceDir}, so ${VIRTUAL_LINKS_SPECIFIER} was not built:\n${errors.join('\n')}`,
    )
  }

  const links: Record<string, unknown> = {}
  for (const file of files) {
    const link = JSON.parse(file.content) as { slug: string }
    links[link.slug] = link
  }

  return `export const links = ${JSON.stringify(links, null, 2)}\n`
}

/**
 * The `resolveId` body. Exported by name because Vite types a plugin's hooks as
 * `ObjectHook` unions — `plugin.resolveId(...)` is not callable off the object — so a
 * spec has to reach the behaviour here rather than through the plugin.
 */
export function resolveVirtualLinks(id: string): string | undefined {
  return id === VIRTUAL_LINKS_SPECIFIER ? VIRTUAL_LINKS_ID : undefined
}

/** The `load` body. Returns undefined for every id but this plugin's own. */
export function loadVirtualLinks(id: string, sourceDir: string): string | undefined {
  return id === VIRTUAL_LINKS_ID ? linksModuleSource(sourceDir) : undefined
}

/**
 * True only for a `*.json` file sitting directly in `sourceDir`. The watcher is registered
 * on the directory, so it reports every path beneath it — without this the module would be
 * invalidated on any unrelated save.
 */
export function isLinkFilePath(path: string, sourceDir: string): boolean {
  return extname(path) === '.json' && resolve(dirname(path)) === resolve(sourceDir)
}

/**
 * One Vite environment, as far as this plugin cares. Generic over the module node so a real
 * `DevEnvironment` satisfies it without a cast: Vite's `invalidateModule` takes an
 * `EnvironmentModuleNode`, and a parameter typed `object` would not accept it.
 */
export interface EnvironmentLike<TModule = unknown> {
  moduleGraph?: {
    getModuleById: (id: string) => TModule | undefined
    invalidateModule: (mod: TModule) => void
  }
}

/**
 * Drops the virtual module from every environment that has it, so the next request re-runs
 * `load` and re-reads the link files.
 *
 * Every environment, not just the Worker's: `vite dev` here has three (ssr, client, and the
 * Worker's own, named after the Worker), the id is identical in all of them, and picking one
 * by name would stop working silently if the Worker were renamed.
 */
export function invalidateVirtualLinks<TModule>(
  environments: Iterable<EnvironmentLike<TModule> | undefined>,
): void {
  for (const environment of environments) {
    const graph = environment?.moduleGraph
    const mod = graph?.getModuleById(VIRTUAL_LINKS_ID)
    if (graph && mod !== undefined)
      graph.invalidateModule(mod)
  }
}

export interface VitePluginLinksOptions {
  /** The directory of `*.json` link files to serve. */
  sourceDir: string
}

/**
 * `sourceDir` is read on every `load`, not cached: Vite calls `load` again once the module
 * is invalidated, and the watcher wiring below is what invalidates it. Caching here would
 * serve a stale map for the rest of the dev session.
 */
export function vitePluginLinks(options: VitePluginLinksOptions): Plugin {
  return {
    name: 'symprex:links',

    resolveId(id) {
      return resolveVirtualLinks(id)
    },

    load(id) {
      return loadVirtualLinks(id, options.sourceDir)
    },

    // The link files are not in the module graph — nothing imports them — so a change to one
    // maps to no module, and Vite neither watches them nor knows what to invalidate. Both
    // halves are needed: `add` puts the directory under the watcher, and the handler
    // invalidates virtual:links so the next request re-runs `load`. Watching alone does
    // nothing observable, which is exactly how an earlier version of this read as working
    // when it did not: its unit tests passed while a link added during `vite dev` still 404ed.
    configureServer(server: ViteDevServer) {
      server.watcher.add(options.sourceDir)

      server.watcher.on('all', (_event, path) => {
        if (isLinkFilePath(path, options.sourceDir))
          invalidateVirtualLinks(Object.values(server.environments))
      })
    },
  }
}
