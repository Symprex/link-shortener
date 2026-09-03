// The redirect Worker's entry point: router skeleton, plus the styled unknown-slug 404
// page. Each redirect and each miss is logged to Analytics Engine (see src/analytics.ts).
//
// This Worker is deliberately, entirely public and carries no authentication of its own.
// D21 moved the admin surface onto its own Worker (src/admin/index.ts, wrangler.admin.jsonc)
// precisely so that Cloudflare's Worker-level Access — which is all-or-nothing across every
// route, custom domain, workers.dev hostname and preview of a Worker — can protect the admin
// page without putting every short link behind a login. Nothing admin-shaped belongs here:
// "admin" stays in RESERVED_SLUGS (src/redirect.ts) so /admin 404s on this host rather than
// resolving as a link, both before the go.symprex.com/admin* route exists and as defence
// after it does.
import type { AnalyticsEngineDataset, AnalyticsExecutionContext } from "./analytics.ts";
import { recordAnalytics } from "./analytics.ts";
import { escapeHtml } from "./html.ts";
import { links } from "./links.generated.ts";
import { redirectFor, stripSlashes } from "./redirect.ts";
import { THEME_CSS } from "./theme.ts";
import { PICO_CSS } from "./vendor/pico.ts";

export interface Env {
  ANALYTICS: AnalyticsEngineDataset | undefined;
}

export default {
  async fetch(request: Request, env: Env, ctx: AnalyticsExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const match = redirectFor(url.pathname, links);
    if (match) {
      // Indexed by the link's own canonical slug, not the raw request slug, so /foo
      // and /FOO (resolved by redirectFor's case-insensitive lookup) contribute to the
      // same index rather than fragmenting the per-link total (D14).
      recordAnalytics(env.ANALYTICS, ctx, match.slug, request, "hit");
      return match.response;
    }

    // No link resolved, so there is no canonical slug to index by — the raw (unresolved)
    // request slug is what was actually looked up and missed.
    recordAnalytics(env.ANALYTICS, ctx, stripSlashes(url.pathname), request, "miss");
    return notFound(url.pathname);
  },
};

/**
 * This is the one page an outsider might actually see, on the Worker that carries no
 * authentication of its own (see this module's header comment) — so, per the engineer,
 * it reveals no internal knowledge. It used to name the missing-link file path
 * (`links/<slug>.json`), invite a pull request and link to `docs/links.md` on GitHub;
 * all of that told a stranger exactly how this repository is organised, which is not
 * theirs to know. What is left is a short, calm, user-friendly page pointing to
 * symprex.com.
 *
 * The requested slug is still shown, deliberately: `/carers` doesn't exist is
 * user-friendly (it tells the visitor what they typed, in case of a typo) and reveals
 * nothing about how this Worker or its data are built — it is only what the visitor
 * themselves put in the address bar, echoed back. It remains HTML-escaped for the same
 * reason as before: the slug's percent-encoding is decoded for readability (so
 * `%3Cfoo%3E` shows as `<foo>` rather than as an encoded string), and decoding is
 * exactly what can turn an encoded `%3Cscript%3E` into a literal `<script>` — the slug
 * comes straight from the URL and is attacker-controlled.
 *
 * The miss itself is still logged to Analytics Engine by the caller (recordAnalytics,
 * above) regardless of what this page renders — the admin page's "Top missing slugs"
 * table depends on that, and this function has no part in it either way.
 *
 * Styled with the same Signature365 theme (src/theme.ts) the admin page uses (D21 moved
 * admin behind Access on its own Worker, but this 404 is on the public one, so it should
 * not look like a different product). Pico and the theme are two separate `<style>` tags
 * rather than one combined block — Pico's minified CSS leaves the parser inside an open
 * rule, so anything appended after it in the same tag is parsed as a CSS-nested child of
 * Pico's last selector and never matches (see src/admin/page.ts's STYLE_TAGS for the full
 * diagnosis); no bespoke CSS is needed here regardless (a bare `<code>` already picks up
 * `--s-code-bg`/`--s-code-color` and a bare `<a>` already picks up
 * `--sig365-theme-link-color`, both via the Pico variable overrides in src/theme.ts, which
 * now out-specify Pico's own `:root:not([data-theme...])` declarations — see theme.ts's
 * header comment for why bare `:root` used to lose that tie).
 */
function notFound(pathname: string): Response {
  const slug = decodeSlug(stripSlashes(pathname));
  const body = `<!doctype html>
<html lang="en">
  ${HEAD}
  <body>
    <main>
      <h1>Not found</h1>
      <p><code>${escapeHtml(slug)}</code> doesn't exist.</p>
      <p>Visit <a href="https://www.symprex.com">symprex.com</a> instead.</p>
    </main>
  </body>
</html>
`;
  return new Response(body, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Hoisted to a module constant rather than rebuilt per request — the admin page's
 * equivalent (STYLE_TAGS in src/admin/page.ts) already does this, and there is nothing
 * request-specific in here (the escaped slug is interpolated separately, in notFound's own
 * body template). Pico and the theme stay two separate `<style>` tags rather than one
 * combined block for the reason given in notFound's own doc comment above — Pico's
 * minified CSS leaves the parser inside an open rule, so merging them back would make the
 * theme's rules invisible again.
 */
const HEAD = `<head>
    <meta charset="utf-8" />
    <title>Not found — go.symprex.com</title>
    <style>${PICO_CSS}</style>
    <style>${THEME_CSS}</style>
  </head>`;

/** Decodes a URL path segment, falling back to the raw value if it is not valid percent-encoding. */
function decodeSlug(rawSlug: string): string {
  try {
    return decodeURIComponent(rawSlug);
  } catch {
    return rawSlug;
  }
}
