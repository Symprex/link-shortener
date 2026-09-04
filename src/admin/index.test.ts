// Proves the admin Worker's entry point (D21): the routing it answers on, and the
// `!ctx.access` defensive belt in front of everything.
//
// Seam: the exported `fetch` handler, invoked directly with a hand-built execution
// context — deliberately not SELF.fetch(). Two reasons, and the second is the important
// one:
//
//  1. SELF in this vitest project is the *redirect* Worker (the project is configured
//     against wrangler.worker.jsonc), so it cannot reach this Worker at all.
//  2. @cloudflare/vitest-pool-workers 0.22.0 does not wire `ctx.access` through even for
//     the Worker it does host — createExecutionContext()'s shim exposes only waitUntil,
//     passThroughOnException and exports. Under SELF, `ctx.access` is therefore always
//     undefined, so the admitted branch is unreachable and an "authenticated request"
//     test would pass while proving nothing.
//
// Calling the handler with a context this file constructs is what makes both branches
// observable. The context is typed against the real generated runtime types
// (CloudflareAccessContext / CloudflareAccessIdentity, emitted by `wrangler types`), with
// no cast anywhere, so `tsc --noEmit` is what holds the fixture to the shape the runtime
// actually passes. Edge enforcement itself is not proved here and cannot be — that is a
// deployed HTTP check plus `wrangler dev` with wrangler.admin.jsonc's `access.dev` block.
import type { AdminExecutionContext } from "./index.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import adminWorker from "./index.ts";

const ENV = { CF_API_TOKEN: "test-token" };

/** Every SQL statement the stubbed fetch was asked to run, in order. */
let sqlCalls: string[];

beforeEach(() => {
  sqlCalls = [];
  vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    sqlCalls.push(String(init?.body ?? ""));
    return Response.json({ data: [] });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** An execution context with no Access context — what an unprotected deploy looks like. */
function unprotectedContext(): AdminExecutionContext {
  return {};
}

const AN_IDENTITY: CloudflareAccessIdentity = { email: "adb@symprex.com" };

/**
 * An execution context carrying an Access context, the way the edge attaches one once
 * Worker-level Access is enabled. The page no longer reads the identity (the "Signed in
 * as" line is gone), so getIdentity rejects loudly if it is ever called — a silent
 * reintroduction of the identity round trip would otherwise pass unnoticed.
 */
function admittedContext(): AdminExecutionContext {
  return {
    access: {
      aud: "test-aud",
      getIdentity: () => Promise.reject(new Error("getIdentity should not be called")),
    },
  };
}

function get(path: string, ctx: AdminExecutionContext): Promise<Response> {
  return adminWorker.fetch(
    new Request(`https://link-shortener-admin.workers.dev${path}`),
    ENV,
    ctx,
  );
}

describe("the admin worker", () => {
  it("refuses every request when the edge attached no Access context", async () => {
    const response = await get("/admin", unprotectedContext());
    expect(response.status).toBe(403);
    expect(response.status).not.toBe(200);
  });

  it("issues no SQL subrequest for a refused request, so CF_API_TOKEN never leaves", async () => {
    // The gate must come before renderAdminPage(), not after: the page fans out six
    // Analytics Engine queries, each carrying CF_API_TOKEN as a bearer token. Hoisting the
    // render above the guard would leave the status at 403 and this assertion is the only
    // thing that would notice.
    await get("/admin", unprotectedContext());
    expect(sqlCalls).toHaveLength(0);
  });

  it("refuses rather than 404s an unknown path with no Access context, revealing no routing", async () => {
    // Guard before router: without Access, nothing about this Worker — not even which
    // paths it serves — is observable.
    const response = await get("/not-a-page", unprotectedContext());
    expect(response.status).toBe(403);
    expect(response.status).not.toBe(404);
  });

  it("marks the refusal no-store", async () => {
    const response = await get("/admin", unprotectedContext());
    // Status pinned too: the page response also carries no-store, so without this the
    // assertion would pass on a page served to an unadmitted caller.
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves the statistics page at the hostname root, which is where workers.dev reaches it", async () => {
    const response = await get("/", admittedContext());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toContain("<h1>Symprex Go</h1>");
  });

  it.each(["/admin", "/admin/"])(
    "serves the statistics page at %s, which is where the go.symprex.com route will send it",
    async (path) => {
      const response = await get(path, admittedContext());
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("<h1>Symprex Go</h1>");
    },
  );

  it("marks the page no-store, even though it no longer names the signed-in user", async () => {
    const response = await get("/admin", admittedContext());
    // Status pinned too: the 403 also carries no-store, so without this the assertion
    // would pass on a refusal.
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("passes the query string on, so ?days=7 selects the 7-day window", async () => {
    const response = await get("/admin?days=7", admittedContext());
    const body = await response.text();
    // The selected window is the only one rendered as <strong> rather than as a link
    // (src/admin/page.ts's renderWindowSelector), so this is the page agreeing that the
    // URL's query reached parseDays.
    expect(body).toContain("<strong>7 days</strong>");
    expect(body).toContain("?days=30");
  });

  it.each(["/not-a-page", "/admin/anything", "/favicon.ico"])(
    "404s %s for an admitted caller — this Worker serves one page and nothing else",
    async (path) => {
      const response = await get(path, admittedContext());
      expect(response.status).toBe(404);
    },
  );

  it("issues no SQL subrequest for a path it does not serve", async () => {
    await get("/favicon.ico", admittedContext());
    expect(sqlCalls).toHaveLength(0);
  });

  it("marks a 404 no-store like every other answer — this Worker only ever replies to an Access-admitted caller", async () => {
    const response = await get("/not-a-page", admittedContext());
    // Status pinned alongside the header so this cannot pass on the page's or the
    // refusal's response instead.
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("never calls getIdentity — the page no longer names the signed-in user, so the identity round trip is gone", async () => {
    // A deep review noted the identity lookup used to be awaited ahead of the six SQL
    // queries on every page load; removing "Signed in as" removes the only reason to make
    // that call at all. A spy proves the call itself is gone, not just its rendering.
    const getIdentity = vi.fn(() => Promise.resolve(AN_IDENTITY));
    const response = await get("/admin", { access: { aud: "test-aud", getIdentity } });
    expect(response.status).toBe(200);
    expect(getIdentity).not.toHaveBeenCalled();
  });
});
