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
// colours follow the Signature365 palette. Vendored Pico 2.1.1 (src/vendor/pico.ts)
// declares those same variables on `:root:not([data-theme=dark]),[data-theme=light]` in
// light mode and on `:root:not([data-theme])` inside its own dark media block — both
// specificity 0,2,0, which beats bare `:root` (0,1,0) regardless of document order. Bare
// `:root` here was silently inert in both colour schemes as a result (every override
// except `--pico-border-color`). The light block below therefore uses
// `:root:not([data-theme=dark])` rather than `:root:not([data-theme])`: it reaches the same
// 0,2,0 specificity, but — unlike a bare `[data-theme]` presence check — it matches exactly
// the set of states Pico's own light selector matches, including once a `data-theme="light"`
// attribute is present, not only while neither page ever sets the attribute at all. These
// declarations win the cascade on the resulting tie, appended after `PICO_CSS` in each
// page's `<style>` tag as they are.
// `--pico-code-background-color` / `--pico-code-color` are included so a bare `<code>`
// element — the 404 page's slug, with no bespoke rule of its own — already picks up
// `--s-code-bg` / `--s-code-color` through Pico's own `<code>` styling.
//
// What is *not* here: the admin-only rules (`.bar-track`, `.bar-fill`, `.pct`,
// `.country-badge`, table styling and the `.panel` box itself) stay in src/admin/page.ts's
// own EXTRA_CSS, since the 404 page has no bars, badges, tables or panels and should not
// carry their CSS. `body`, `h1`/`h2` and `section` are shared because both pages use them:
// the 404 page is plain-page content (`body`, `h1`) and the admin page additionally uses
// `section` to space its heading-then-panel blocks apart — `section` itself carries no
// background any more (Signature365's own pattern: the heading sits on the page
// background, and only the panel below it is a distinct box; see `.panel` in EXTRA_CSS).
export const THEME_CSS = `
:root:not([data-theme=dark]) {
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
  :root:not([data-theme]) {
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
  margin-bottom: var(--s-space-lg);
}
`;
