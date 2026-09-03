// Reproduces server/middleware/1.redirect.ts's redirect contract without KV: slug
// regex, case-insensitive lookup with an original-case fallback, 301 for a resolved
// link (302 for the home page — see redirectFor's "/" branch), and no query string
// forwarded to the target (redirectWithQuery: false in the old nuxt.config.ts).
import type { Link } from "./types.ts";

export const HOME_URL = "https://www.symprex.com";
export const RESERVED_SLUGS = new Set(["admin"]);
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/**
 * Looks up `slug` in `links`, lowercase-first with a fallback to the original casing —
 * matching the old middleware's `caseSensitive: false` behaviour exactly.
 */
export function resolveLink(links: Record<string, Link>, slug: string): Link | null {
  const lowerCaseSlug = slug.toLowerCase();
  if (links[lowerCaseSlug]) return links[lowerCaseSlug];

  if (lowerCaseSlug !== slug && links[slug]) return links[slug];

  return null;
}

/**
 * Strips exactly one leading and one trailing slash — matching the old middleware
 * (`event.path.replace(/^\/|\/$/g, '')`). Deliberately not a `+` quantifier: a doubled
 * slash (`//foo`, `foo//`) leaves one behind, which then fails SLUG_REGEX below, so a
 * doubled slash 404s rather than silently redirecting.
 */
export function stripSlashes(pathname: string): string {
  return pathname.replace(/^\/|\/$/g, "");
}

/** The outcome of a resolved redirect: the response to send, and the slug to index it
 * under in analytics — the link's own canonical slug for a real link, so `/foo` and
 * `/FOO` (case-insensitive lookup) contribute to the same index rather than fragmenting
 * it (D14). The home page has no link (it is configuration, `HOME_URL`, not a
 * git-defined file under links/), but `/` is still a real, resolvable path, so it is
 * indexed under the literal slug `"/"` rather than an empty string — a genuine row in
 * the per-link table, not a sentinel that reads as missing data.
 */
export interface RedirectMatch {
  response: Response;
  slug: string;
}

/**
 * Builds the redirect for an incoming request path, or `null` if it does not resolve to
 * a link so the caller can fall through to its own not-found handling. Leading and
 * trailing slashes are tolerated (see stripSlashes); a slug failing the regex is
 * treated as unknown rather than as an error.
 */
export function redirectFor(pathname: string, links: Record<string, Link>): RedirectMatch | null {
  // Deliberately not redirectTo(): the old middleware calls sendRedirect(event, homeURL)
  // with no status argument on this branch, so h3 defaults to 302 — it never reaches
  // redirectStatusCode (301), which only the slug branch below passes. Kept as its own
  // helper (homeRedirect) rather than a status parameter on redirectTo() so the two
  // statuses cannot drift into each other again.
  if (pathname === "/") return { response: homeRedirect(), slug: "/" };

  const slug = stripSlashes(pathname);
  if (!slug || !SLUG_REGEX.test(slug) || RESERVED_SLUGS.has(slug.toLowerCase())) return null;

  const link = resolveLink(links, slug);
  if (!link) return null;

  // link.url is used verbatim — the request's own query string (carried in
  // `pathname`'s sibling, the URL's search) is never read here.
  return { response: redirectTo(link.url), slug: link.slug };
}

/**
 * A 301 to `target`, set directly on the Location header rather than via
 * `Response.redirect()`, which parses the URL through the WHATWG URL constructor and
 * would silently add a trailing slash to a bare origin like `https://www.symprex.com`.
 */
function redirectTo(target: string): Response {
  return new Response(null, { status: 301, headers: { Location: target } });
}

/** A 302 to HOME_URL — see the comment at its call site for why this must not be 301. */
function homeRedirect(): Response {
  return new Response(null, { status: 302, headers: { Location: HOME_URL } });
}
