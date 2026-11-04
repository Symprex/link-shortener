// The admin Worker's entry point (D21, superseding D7). A second, separate Worker whose
// only job is to serve the statistics page, protected *wholly* by Cloudflare Worker-level
// Access — configured on the Worker in wrangler.admin.jsonc, enforced at the edge before
// any of this code runs.
//
// Why it is its own Worker: Worker-level Access is all-or-nothing. It protects every
// route, custom domain, workers.dev hostname and preview of the Worker it is applied to.
// Applied to the redirect Worker it would put every short link behind a login and break
// the product, so the two surfaces must be two Workers — this one entirely protected, the
// redirect Worker (src/index.ts) entirely public.
//
// There is no authentication logic of ours here, and that is the point of D21: the
// hand-written JWT verifier this replaces (src/access.ts, deleted) was the module a deep
// review found five real defects in, including a JWKS fail-open. What remains is one
// defensive belt — `ctx.access` must be present.
//
// Shared with the redirect Worker, one copy each and imported by both: src/html.ts and
// src/vendor/pico.ts (both reached via src/admin/page.ts). Nothing else is shared; the
// links map, src/redirect.ts and src/analytics.ts belong to the redirect Worker alone,
// and this Worker deliberately has no links binding of any kind.
import { renderAdminPage } from "./page.ts";

/**
 * `CF_API_TOKEN` is a secret, never a var — it is the bearer token src/admin/queries.ts
 * puts on its Analytics Engine SQL API calls. Set it with:
 *   pnpm exec wrangler secret put CF_API_TOKEN -c wrangler.admin.jsonc
 * There is no ANALYTICS binding in this interface: the page reads the dataset through the
 * SQL HTTP API, not through a binding, so nothing here would use one.
 */
export interface Env {
  CF_API_TOKEN: string;
}

/**
 * The subset of `ExecutionContext` this Worker reads: only the Access context the edge
 * attaches. `CloudflareAccessContext` is the real generated runtime type — `wrangler
 * types` emits `readonly access?: CloudflareAccessContext` on `ExecutionContext`, with a
 * fully typed `CloudflareAccessIdentity` behind it — so nothing here is cast or
 * hand-approximated, and a test can hand in a context with or without Access and have
 * `tsc --noEmit` hold its fixture to the shape the runtime actually passes.
 *
 * Narrowed the same way src/analytics.ts narrows `AnalyticsExecutionContext`: this Worker
 * has no use for waitUntil or the rest.
 */
export interface AdminExecutionContext {
  readonly access?: CloudflareAccessContext;
}

export default {
  async fetch(request: Request, env: Env, ctx: AdminExecutionContext): Promise<Response> {
    // The defensive belt, not the lock. `ctx.access` is absent exactly when Access is not
    // enforcing in front of this Worker — a deploy with the Access application not yet
    // created or switched off, or a `wrangler dev` with no `access.dev` block — so
    // refusing here is what stops an unprotected deploy from quietly publishing the
    // statistics page. Fail-closed, deliberately: an admin surface that answers when its
    // protection is missing is worse than one that is briefly unreachable.
    //
    // It comes before the router, so an unadmitted caller cannot even learn which paths
    // this Worker serves; and it comes before renderAdminPage(), so a refused request
    // issues none of the page's six Analytics Engine subrequests and never puts
    // CF_API_TOKEN on the wire.
    if (!ctx.access) return forbidden();

    const url = new URL(request.url);
    if (!isPagePath(url.pathname)) return notFound();

    const page = await renderAdminPage(env, url);
    // Cached per caller regardless: this Worker only ever answers an Access-admitted
    // request, so nothing it returns should sit in a shared cache.
    page.headers.set("Cache-Control", "no-store");
    return page;
  },
};

/**
 * The statistics page is served at `/` and at `/admin`, with or without a trailing slash.
 * Both are needed: on workers.dev this Worker is reached at its own hostname root, while
 * after cutover a route sends `go.symprex.com/admin*` here. Everything else is a 404 —
 * that route is a prefix match, so `/admin/anything` arrives here too and is not this
 * page. There is exactly one page and no other surface.
 */
function isPagePath(pathname: string): boolean {
  return pathname === "/" || pathname === "/admin" || pathname === "/admin/";
}

function forbidden(): Response {
  return new Response("Forbidden", {
    status: 403,
    headers: { "Cache-Control": "no-store" },
  });
}

function notFound(): Response {
  // no-store like the other two answers: this Worker only ever responds to an
  // Access-admitted caller, so nothing it returns should sit in a shared cache.
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}
