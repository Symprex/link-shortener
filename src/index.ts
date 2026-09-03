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
 * The slug's percent-encoding is decoded for a readable page (so `%3Cfoo%3E` shows as
 * `<foo>` rather than as an encoded string) and HTML-escaped afterwards, since decoding
 * is exactly what can turn an encoded `%3Cscript%3E` into a literal `<script>` — the
 * slug comes straight from the URL and is attacker-controlled.
 *
 * Styled with the same Signature365 theme (src/theme.ts) the admin page uses (D21 moved
 * admin behind Access on its own Worker, but this 404 is on the public one — the one page
 * an outsider might actually see, so it should not look like a different product). Pico
 * and the theme are two separate `<style>` tags rather than one combined block: no bespoke
 * CSS is needed here (a bare `<code>` already picks up `--s-code-bg`/`--s-code-color` and
 * a bare `<a>` already picks up `--sig365-theme-link-color`, both via the Pico variable
 * overrides in src/theme.ts), so there is nothing to append PICO_CSS with.
 */
function notFound(pathname: string): Response {
  const slug = decodeSlug(stripSlashes(pathname));
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Not found — go.symprex.com</title>
    <style>${PICO_CSS}</style>
    <style>${THEME_CSS}</style>
  </head>
  <body>
    <main>
      <h1>Not found</h1>
      <p><code>${escapeHtml(slug)}</code> is not a link on go.symprex.com.</p>
      <p>
        To request it, open a pull request adding
        <code>links/${escapeHtml(slug)}.json</code> — see
        <a
          href="https://github.com/Symprex/link-shortener/blob/master/docs/links.md"
        >docs/links.md</a> for the file format.
      </p>
    </main>
  </body>
</html>
`;
  return new Response(body, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** Decodes a URL path segment, falling back to the raw value if it is not valid percent-encoding. */
function decodeSlug(rawSlug: string): string {
  try {
    return decodeURIComponent(rawSlug);
  } catch {
    return rawSlug;
  }
}
