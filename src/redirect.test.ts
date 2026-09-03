// The five contracts from the migration spec, driven through the Worker's real fetch
// handler (SELF.fetch()) rather than any internal helper, plus the query-string case.
// src/test/global-setup.ts compiles src/test/fixtures/links/foo.json into
// src/links.generated.ts before this project's tests run.
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { redirectFor, resolveLink } from "./redirect.ts";
import { PICO_CSS } from "./vendor/pico.ts";

describe("the redirect worker", () => {
  it("redirects a known slug with a 301 to its target", async () => {
    const response = await SELF.fetch("https://go.symprex.com/foo", { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("https://x/y");
  });

  it("is case-insensitive and tolerates a trailing slash", async () => {
    const response = await SELF.fetch("https://go.symprex.com/FOO/", { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("https://x/y");
  });

  it("does not forward a query string to the redirect target", async () => {
    const response = await SELF.fetch("https://go.symprex.com/foo?a=1", { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("https://x/y");
  });

  it("returns a 404 naming the slug for an unknown link", async () => {
    const response = await SELF.fetch("https://go.symprex.com/nope", { redirect: "manual" });
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toContain("nope");
  });

  it("escapes a slug containing markup instead of rendering it", async () => {
    const response = await SELF.fetch("https://go.symprex.com/%3Cscript%3Ealert(1)%3C/script%3E", {
      redirect: "manual",
    });
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain("<script>alert(1)</script>");
    expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("inlines the vendored Pico CSS into the 404 page", async () => {
    const response = await SELF.fetch("https://go.symprex.com/nope", { redirect: "manual" });
    const body = await response.text();
    expect(body).toContain(`<style>${PICO_CSS}</style>`);
  });

  it("carries the shared Signature365 theme tokens, in both a light and a dark block", async () => {
    const response = await SELF.fetch("https://go.symprex.com/nope", { redirect: "manual" });
    const body = await response.text();

    // Light values, worked from the shared theme's own token table rather than re-derived
    // from the implementation: the light declarations sit outside any media query.
    expect(body).toContain("--s-page-bg: #f9fafb");
    expect(body).toContain("--s-heading-color: #111827");
    expect(body).toContain("--sig365-theme-link-color: #1570cd");

    // The dark block is a real @media (prefers-color-scheme: dark) rule carrying the dark
    // values from the same table, restating the Pico variable overrides so Pico's own
    // dark-mode rule does not win the palette back.
    const darkBlockMatch = body.match(
      /@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n\s{0,4}\}/,
    );
    expect(darkBlockMatch).not.toBeNull();
    const darkBlock = darkBlockMatch?.[1] ?? "";
    expect(darkBlock).toContain("--s-page-bg: #0f1117");
    expect(darkBlock).toContain("--pico-primary: var(--sig365-theme-link-color)");

    // Neither the light block (`:root:not([data-theme=dark])`) nor the dark block
    // (`:root:not([data-theme])`) matches a root carrying `data-theme="dark"` — that state
    // falls between the two, so every --s-* token would be undeclared rather than merely
    // reverted to Pico's palette, blanking body, .panel and the bars. It is safe today only
    // because this page never emits a `data-theme` attribute and has no client JavaScript
    // to add one. If a theme toggle is ever added, THEME_CSS's selectors must be revisited
    // together with whatever sets the attribute — do not just delete this assertion. (The
    // literal string "data-theme" legitimately appears inside THEME_CSS's own selectors, so
    // this checks the <html> tag specifically rather than the whole body.)
    expect(body).toMatch(/<html lang="en">/);
    expect(body).not.toMatch(/<html[^>]*\bdata-theme/);
  });

  it("loads no external stylesheet, script or image on the 404 page", async () => {
    const response = await SELF.fetch("https://go.symprex.com/nope", { redirect: "manual" });
    const body = await response.text();

    // No <link> (an external stylesheet) or <script> tag at all — Pico is inlined and
    // there is no client JavaScript. The symprex.com link at the foot of the page is a
    // normal navigational <a href="https://…">, which this deliberately does not
    // forbid — only a resource the browser loads automatically.
    expect(body).not.toContain("<link");
    expect(body).not.toContain("<script");
    expect(body).not.toMatch(/\bsrc="https?:\/\//);
  });

  it("reveals no internal knowledge on the 404 page — no file path, no pull request, no repository link", async () => {
    // The engineer's own words: the public 404 must show only a user-friendly page and
    // must contain no details of how to add a redirect, since that is internal
    // knowledge. Before this test, the page named links/<slug>.json and linked to
    // docs/links.md on GitHub.
    const response = await SELF.fetch("https://go.symprex.com/nope", { redirect: "manual" });
    const body = await response.text();

    expect(body).not.toContain("links/");
    expect(body).not.toContain(".json");
    expect(body).not.toContain("pull request");
    expect(body).not.toContain("github.com");
    expect(body).not.toContain("docs/links.md");
    expect(body).toContain("https://www.symprex.com");
  });

  it("redirects the home page to the Symprex marketing site with a 302, not a 301", async () => {
    // The old middleware calls sendRedirect(event, homeURL) with no status argument on
    // this branch, so h3 defaults to 302 — it never reaches redirectStatusCode (301),
    // which only the slug branch passes. Exact parity means the root must keep 302: a
    // 301 here is effectively irreversible once caches and crawlers pick it up.
    const response = await SELF.fetch("https://go.symprex.com/", { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.status).not.toBe(301);
    expect(response.headers.get("Location")).toBe("https://www.symprex.com");
  });

  it("does not serve /admin at all — it is a 404 here, not a gated page (D21)", async () => {
    // D21 moved the admin surface to its own Worker, protected wholly by Worker-level
    // Access. This Worker has no admin branch and no gate of its own, so /admin falls
    // through to the unknown-slug 404 like any other reserved name. The explicit
    // not.toBe(403) is the point: a 403 here would mean a gate is still in the redirect
    // path, which under D21 is exactly the thing that must be gone.
    const response = await SELF.fetch("https://go.symprex.com/admin", { redirect: "manual" });
    expect(response.status).toBe(404);
    expect(response.status).not.toBe(403);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toContain("admin");
  });

  it("does not serve a path below /admin either", async () => {
    const response = await SELF.fetch("https://go.symprex.com/admin/anything", {
      redirect: "manual",
    });
    expect(response.status).toBe(404);
  });

  it("treats a doubled leading or trailing slash as unknown, matching the old middleware", async () => {
    // Old: event.path.replace(/^\/|\/$/g, '') strips exactly one leading and one
    // trailing slash, so a second one is a residual character that fails the slug
    // regex — //foo and foo// both 404 rather than redirecting.
    const doubledLeading = await SELF.fetch("https://go.symprex.com//foo", { redirect: "manual" });
    expect(doubledLeading.status).toBe(404);

    const doubledTrailing = await SELF.fetch("https://go.symprex.com/foo//", {
      redirect: "manual",
    });
    expect(doubledTrailing.status).toBe(404);
  });
});

describe("resolveLink", () => {
  const link = { id: "abc", url: "https://x/y", slug: "Foo", createdAt: 0, updatedAt: 0 };

  it("finds a link keyed by the lowercase form of the slug", () => {
    expect(resolveLink({ foo: link }, "FOO")).toBe(link);
  });

  it("falls back to the original casing when the lowercase key is absent", () => {
    // Real generated maps only ever hold lowercase keys, but resolveLink itself is a
    // general lookup — this proves the fallback branch (caseSensitive: false in the old
    // middleware) independently of what the generator happens to produce.
    expect(resolveLink({ Foo: link }, "Foo")).toBe(link);
  });

  it("returns null when neither the lowercase nor the original-case key matches", () => {
    expect(resolveLink({ foo: link }, "bar")).toBeNull();
  });
});

describe("redirectFor", () => {
  const links = {
    admin: { id: "abc", url: "https://x/y", slug: "admin", createdAt: 0, updatedAt: 0 },
  };

  it('treats the reserved slug "admin" as unknown even if a link happens to use it', () => {
    // The generator would never write an "admin" entry (validate-links.ts rejects it),
    // but redirectFor's own guard is what actually enforces the reservation — proven
    // here by handing it a map that breaks that assumption.
    expect(redirectFor("/admin", links)).toBeNull();
  });

  it("treats a doubled leading or trailing slash as unknown", () => {
    expect(redirectFor("//foo", links)).toBeNull();
    expect(redirectFor("/foo//", links)).toBeNull();
  });
});
