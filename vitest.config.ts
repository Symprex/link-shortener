import { fileURLToPath } from 'node:url'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'
import { vitePluginLinks } from './scripts/vite-plugin-links.ts'

// A projects-style config rather than a single flat one, so the redirect and
// admin Workers can each run against their own wrangler config. "redirect"
// covers only src/*.test.ts (the top-level Worker files); "admin" covers
// src/admin/**/*.test.ts against wrangler.admin.jsonc.
//
// The redirect project supplies virtual:links from src/test/fixtures/links/ through
// the same plugin the real build uses (vite.worker.config.ts), so the Worker under
// test resolves a controlled fixture set. This replaced a globalSetup that generated
// src/links.generated.ts from those fixtures: it wrote over the real generated file
// as a side effect of running the suite, so a later `wrangler deploy` could ship a
// Worker serving only the fixture slug. A virtual module cannot be written over.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'scripts',
          environment: 'node',
          include: ['scripts/**/*.test.ts'],
        },
      },
      {
        plugins: [
          vitePluginLinks({
            sourceDir: fileURLToPath(new URL('./src/test/fixtures/links', import.meta.url)),
          }),
          cloudflareTest({
            wrangler: { configPath: './wrangler.worker.jsonc' },
          }),
        ],
        test: {
          name: 'redirect',
          include: ['src/*.test.ts'],
        },
      },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.admin.jsonc' },
          }),
        ],
        test: {
          name: 'admin',
          include: ['src/admin/**/*.test.ts'],
        },
      },
    ],
  },
})
