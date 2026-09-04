import { fileURLToPath } from 'node:url'
// Builds the redirect Worker. Only this Worker gets a Vite build: it is the one that
// imports virtual:links, and a virtual module only exists if Vite does the bundling
// (wrangler runs esbuild directly and takes no plugins).
//
// The admin Worker is deliberately left on plain `wrangler deploy` / `wrangler dev`
// against wrangler.admin.jsonc. It imports no links map, so a Vite build would buy it
// nothing, and keeping it on wrangler leaves its `access.dev` local-identity
// simulation (wrangler.admin.jsonc) working exactly as before.
//
// Two Workers, two toolchains, on purpose — not a multi-Worker Vite setup. The
// plugin's `auxiliaryWorkers` exposes only the primary Worker locally and reaches the
// rest through service bindings; these two Workers have none and are independent by
// design (separate hostnames, split so Worker-level Access can protect /admin without
// putting every short link behind a login).
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'
import { vitePluginLinks } from './scripts/vite-plugin-links.ts'

export default defineConfig({
  // Not `dist`: that is the legacy Nuxt build's output, still used by the `preview`
  // and `deploy` scripts, and interleaving two unrelated builds in one directory is
  // how you deploy half of each. The Nuxt tree goes in a later PR, at which point
  // this can move to the conventional `dist`.
  build: { outDir: '.worker-build' },
  // Vite's default publicDir is `public`, which here is the legacy Nuxt asset set —
  // favicons, banner.png, countries.geojson, the lot. Left on, the build copies all of
  // it into the output and the redirect Worker deploys it as static assets. This
  // Worker serves redirects and one 404 page and has no assets of its own.
  publicDir: false,
  plugins: [
    vitePluginLinks({
      sourceDir: fileURLToPath(new URL('./links', import.meta.url)),
    }),
    cloudflare({ configPath: './wrangler.worker.jsonc' }),
  ],
})
