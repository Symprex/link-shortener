// The Signature365 design tokens both Workers' server-rendered pages share: the admin
// statistics page (src/admin/page.ts, behind Access) and the redirect Worker's
// unknown-slug 404 page (src/index.ts, the one page an outsider might actually see). One
// copy, imported by both — following the same pattern src/html.ts and src/vendor/pico.ts
// already use, rather than letting a second copy of the palette drift from this one.
//
// Token names and light/dark values are taken from Signature365's own
// `frontend/packages/common/src/css/_theme.css` so both surfaces read as the same product
// rather than inventing a parallel palette. Signature365 itself switches its dark values on
// a `body--dark` class because it has a user-facing toggle; neither page here has client
// JavaScript or a toggle, so `@media (prefers-color-scheme: dark)` is the honest
// equivalent — it reads the same signal (the visitor's OS/browser preference) the toggle
// would otherwise be seeded from.
//
// Both blocks also redeclare the handful of Pico variables (`--pico-*`) that Pico's own
// reset, typography and table rules read from, so Pico's structure is kept (D2) while its
// colours follow the Signature365 palette. This module is appended after `PICO_CSS` in each
// page's `<style>` tag, so on a tie these declarations win the cascade — including inside
// Pico's own `prefers-color-scheme: dark` block, which would otherwise put its colours back.
// `--pico-code-background-color` / `--pico-code-color` are included so a bare `<code>`
// element — the 404 page's slug, with no bespoke rule of its own — already picks up
// `--s-code-bg` / `--s-code-color` through Pico's own `<code>` styling.
//
// What is *not* here: the admin-only rules (`.bar-track`, `.bar-fill`, `.pct`,
// `.country-badge`, table styling) stay in src/admin/page.ts's own EXTRA_CSS, since the 404
// page has no bars, badges or tables and should not carry their CSS. `body`, `h1`/`h2` and
// `section` are shared because both pages use them: the 404 page is plain-page content
// (`body`, `h1`) and the admin page additionally uses `section` for its panels.
export const THEME_CSS = `
:root {
  --s-page-bg: #f9fafb;
  --s-page-accent-bg: #ffffff;
  --s-text-color: #374151;
  --s-heading-color: #111827;
  --s-muted-color: #6b7280;
  --s-faint-color: #9ca3af;
  --s-header-border: #e5e7eb;
  --s-border-color: #e5e7eb;
  --s-table-header-bg: #f3f4f6;
  --s-table-row-border: #f3f4f6;
  --s-code-bg: #f6f8fa;
  --s-code-color: #374151;
  --sig365-theme-link-color: #1570cd;
  --sig365-theme-accent: #f99603;
  --s-space-xs: 4px;
  --s-space-sm: 8px;
  --s-space-md: 16px;
  --s-space-lg: 24px;
  --s-space-xl: 40px;

  --pico-background-color: var(--s-page-bg);
  --pico-color: var(--s-text-color);
  --pico-h1-color: var(--s-heading-color);
  --pico-muted-color: var(--s-muted-color);
  --pico-muted-border-color: var(--s-border-color);
  --pico-border-color: var(--s-border-color);
  --pico-table-border-color: var(--s-table-row-border);
  --pico-primary: var(--sig365-theme-link-color);
  --pico-card-background-color: var(--s-page-accent-bg);
  --pico-card-sectioning-background-color: var(--s-table-header-bg);
  --pico-code-background-color: var(--s-code-bg);
  --pico-code-color: var(--s-code-color);
}
/* Neither page has a client-side theme toggle (no client JavaScript at all), so the
   OS/browser colour-scheme preference is the equivalent of Signature365's body--dark
   class — the honest way to offer a dark palette here. */
@media (prefers-color-scheme: dark) {
  :root {
    --s-page-bg: #0f1117;
    --s-page-accent-bg: #161922;
    --s-text-color: #d1d5db;
    --s-heading-color: #f9fafb;
    --s-muted-color: #9ca3af;
    --s-faint-color: #6b7280;
    --s-header-border: #2a2f3a;
    --s-border-color: #2a2f3a;
    --s-table-header-bg: #1f2330;
    --s-table-row-border: #2a2f3a;
    --s-code-bg: #12151d;
    --s-code-color: #d1d5db;
    --sig365-theme-link-color: #60a5fa;
    --sig365-theme-accent: #f99603;

    --pico-background-color: var(--s-page-bg);
    --pico-color: var(--s-text-color);
    --pico-h1-color: var(--s-heading-color);
    --pico-muted-color: var(--s-muted-color);
    --pico-muted-border-color: var(--s-border-color);
    --pico-border-color: var(--s-border-color);
    --pico-table-border-color: var(--s-table-row-border);
    --pico-primary: var(--sig365-theme-link-color);
    --pico-card-background-color: var(--s-page-accent-bg);
    --pico-card-sectioning-background-color: var(--s-table-header-bg);
    --pico-code-background-color: var(--s-code-bg);
    --pico-code-color: var(--s-code-color);
  }
}
body {
  background: var(--s-page-bg);
}
h1, h2 {
  color: var(--s-heading-color);
}
section {
  background: var(--s-page-accent-bg);
  border: 1px solid var(--s-border-color);
  border-radius: var(--s-space-xs);
  padding: var(--s-space-md);
  margin-bottom: var(--s-space-md);
}
`;
