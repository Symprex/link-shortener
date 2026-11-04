// Proves the analytics write contract from T6: one data point per redirect, indexed by
// slug with exactly four blobs in the documented order; a bot writes nothing; a 404
// writes a distinguishable miss; and neither a throwing `writeDataPoint` nor a missing
// `ANALYTICS` binding can turn a working redirect into a failure.
//
// The pure data-point shape (buildDataPoint) is unit-tested directly. Everything that
// depends on the binding actually being called is driven through the Worker's own
// fetch handler (SELF.fetch()), spying on env.ANALYTICS.writeDataPoint — the same seam
// access.test.ts uses, since SELF runs in the same isolate as the tests.
import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDataPoint, isVerifiedBot } from "./analytics.ts";

const REAL_ANALYTICS = env.ANALYTICS;
const REAL_WRITE_DATA_POINT = REAL_ANALYTICS.writeDataPoint.bind(REAL_ANALYTICS);

afterEach(() => {
  // Several tests replace env.ANALYTICS.writeDataPoint (with a spy or a throwing stub)
  // or delete env.ANALYTICS outright; restore the real binding so later tests do not
  // inherit a broken one.
  env.ANALYTICS = REAL_ANALYTICS;
  env.ANALYTICS.writeDataPoint = REAL_WRITE_DATA_POINT;
});

describe("buildDataPoint", () => {
  it("carries exactly four blobs in the documented order: slug, ip, referer, country", () => {
    const request = new Request("https://go.symprex.com/foo", {
      headers: {
        "CF-Connecting-IP": "203.0.113.9",
        Referer: "https://example.com/page",
      },
      cf: { country: "GB" },
    });

    const point = buildDataPoint("foo", request, "hit");

    expect(point.blobs).toEqual(["foo", "203.0.113.9", "https://example.com/page", "GB"]);
    expect(point.indexes).toEqual(["foo"]);
  });

  it("still produces four blobs, in order, when ip, referer and country are all absent", () => {
    const request = new Request("https://go.symprex.com/foo");

    const point = buildDataPoint("foo", request, "hit");

    expect(point.blobs).toHaveLength(4);
    expect(point.blobs?.[0]).toBe("foo");
    // ip, referer, country are all absent, but the position each occupies must not shift.
    expect(point.blobs?.[1]).toBe(point.blobs?.[2]);
    expect(point.blobs?.[2]).toBe(point.blobs?.[3]);
  });

  it("marks a hit and a miss distinguishably via doubles, not via the index or blobs", () => {
    const request = new Request("https://go.symprex.com/foo");

    const hit = buildDataPoint("foo", request, "hit");
    const miss = buildDataPoint("foo", request, "miss");

    expect(hit.doubles).toEqual([0]);
    expect(miss.doubles).toEqual([1]);
    expect(hit.indexes).toEqual(miss.indexes);
    expect(hit.blobs).toEqual(miss.blobs);
  });
});

describe("isVerifiedBot", () => {
  it("is true when Cloudflare has verified the request as a bot", () => {
    const request = new Request("https://go.symprex.com/foo", {
      cf: { botManagement: { verifiedBot: true } },
    });
    expect(isVerifiedBot(request)).toBe(true);
  });

  it("is false when cf.botManagement.verifiedBot is false or absent", () => {
    expect(isVerifiedBot(new Request("https://go.symprex.com/foo"))).toBe(false);
    expect(
      isVerifiedBot(
        new Request("https://go.symprex.com/foo", {
          cf: { botManagement: { verifiedBot: false } },
        }),
      ),
    ).toBe(false);
  });
});

describe("the redirect worker's analytics write", () => {
  it("writes exactly one data point, indexed by slug, for a known-slug redirect", async () => {
    const writeDataPoint = vi.fn();
    env.ANALYTICS.writeDataPoint = writeDataPoint;

    const response = await SELF.fetch("https://go.symprex.com/foo", { redirect: "manual" });

    expect(response.status).toBe(301);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    const point = writeDataPoint.mock.calls[0][0];
    expect(point.indexes).toEqual(["foo"]);
    expect(point.blobs[0]).toBe("foo");
    expect(point.doubles).toEqual([0]);
  });

  it("indexes a differently-cased request under the link's own canonical slug", async () => {
    // caseSensitive: false exists precisely because the same link is requested in
    // different casings — GET /foo and GET /FOO must contribute to the same index
    // rather than fragmenting the per-link total (D14).
    const writeDataPoint = vi.fn();
    env.ANALYTICS.writeDataPoint = writeDataPoint;

    const response = await SELF.fetch("https://go.symprex.com/FOO", { redirect: "manual" });

    expect(response.status).toBe(301);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    const point = writeDataPoint.mock.calls[0][0];
    expect(point.indexes).toEqual(["foo"]);
    expect(point.blobs[0]).toBe("foo");
  });

  it("writes no data point at all for a request Cloudflare has verified as a bot", async () => {
    const writeDataPoint = vi.fn();
    env.ANALYTICS.writeDataPoint = writeDataPoint;

    const response = await SELF.fetch("https://go.symprex.com/foo", {
      redirect: "manual",
      cf: { botManagement: { verifiedBot: true } },
    });

    expect(response.status).toBe(301);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it("writes a miss event for a 404, distinguishable from a hit", async () => {
    const writeDataPoint = vi.fn();
    env.ANALYTICS.writeDataPoint = writeDataPoint;

    const response = await SELF.fetch("https://go.symprex.com/nope", { redirect: "manual" });

    expect(response.status).toBe(404);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    const point = writeDataPoint.mock.calls[0][0];
    expect(point.doubles).toEqual([1]);
  });

  it("still returns 301 when writeDataPoint throws synchronously", async () => {
    env.ANALYTICS.writeDataPoint = () => {
      throw new Error("Analytics Engine is unavailable");
    };

    const response = await SELF.fetch("https://go.symprex.com/foo", { redirect: "manual" });

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("https://x/y");
  });

  it("still returns 301 when the ANALYTICS binding is missing", async () => {
    // @ts-expect-error deliberately simulating an environment with no binding configured
    delete env.ANALYTICS;

    const response = await SELF.fetch("https://go.symprex.com/foo", { redirect: "manual" });

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("https://x/y");
  });

  it("indexes the home-page redirect under '/' rather than the old empty-string sentinel", async () => {
    const writeDataPoint = vi.fn();
    env.ANALYTICS.writeDataPoint = writeDataPoint;

    const response = await SELF.fetch("https://go.symprex.com/", { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    const point = writeDataPoint.mock.calls[0][0];
    expect(point.indexes).toEqual(["/"]);
    expect(point.blobs[0]).toBe("/");
    expect(point.doubles).toEqual([0]);
  });

  it("writes a miss for a malformed doubled slash, distinguishable from the home hit", async () => {
    // stripSlashes("//") strips one leading and one trailing slash character from the
    // same two-character string, leaving "" — the same value the home redirect used to
    // write. The two must not collide: this is a miss (double1 = 1) at an empty index,
    // never the home hit's "/" index.
    const writeDataPoint = vi.fn();
    env.ANALYTICS.writeDataPoint = writeDataPoint;

    const response = await SELF.fetch("https://go.symprex.com//", { redirect: "manual" });

    expect(response.status).toBe(404);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    const point = writeDataPoint.mock.calls[0][0];
    expect(point.doubles).toEqual([1]);
    expect(point.indexes).not.toEqual(["/"]);
  });
});
