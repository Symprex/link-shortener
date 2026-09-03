import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// A projects-style config rather than a single flat one, so the redirect and
// admin Workers can each run against their own wrangler config. "redirect"
// covers only src/*.test.ts (the top-level Worker files) and keeps the
// links.generated.ts globalSetup, which nothing under src/admin needs;
// "admin" covers src/admin/**/*.test.ts against wrangler.admin.jsonc.
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
          cloudflareTest({
            wrangler: { configPath: './wrangler.worker.jsonc' },
          }),
        ],
        test: {
          name: 'redirect',
          include: ['src/*.test.ts'],
          globalSetup: ['./src/test/global-setup.ts'],
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
