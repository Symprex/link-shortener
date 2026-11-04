// Analytics Engine write for the redirect path. D12: exactly four blobs — slug, ip,
// referer, country — and nothing else, so no UA or accept-language parsing ever runs on
// the redirect path. D14: indexed by slug, not by the link's id, since slug is what the
// stats page filters on. D17: skipped outright for a request Cloudflare has itself
// verified as a bot, with no UA parsing of our own involved.
//
// A miss (404) is written too, so the dataset can show what people are trying that does
// not exist. It carries the same four blobs, keyed by the requested (unresolved) slug,
// and is told apart from a hit by `doubles[0]`: 0 for a redirect, 1 for a miss. That
// lives in `doubles` rather than in the index or a fifth blob because the index and blob
// shape stay identical between the two kinds of event — a reader tells them apart with
// `WHERE double1 = 1`, not by cross-referencing which slugs happen to be real links.

/** The subset of the Analytics Engine binding this module needs. */
export interface AnalyticsEngineDataset {
  writeDataPoint(event?: AnalyticsEngineDataPoint): void;
}

export interface AnalyticsEngineDataPoint {
  indexes?: string[];
  blobs?: string[];
  doubles?: number[];
}

/** The subset of `ExecutionContext` this module needs. */
export interface AnalyticsExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

/** The shape of `Request.cf` this module reads — nothing else, per D12. */
export interface AnalyticsRequestCf {
  country?: string;
  botManagement?: { verifiedBot?: boolean };
}

export type AnalyticsEvent = "hit" | "miss";

/** Stable placeholder for an absent field, so the blob order never shifts. */
const PLACEHOLDER = "-";

/**
 * Builds the data point for one redirect or miss. Pure and independently testable: no
 * binding, no waitUntil, just the fixed blob order the dataset depends on.
 */
export function buildDataPoint(
  slug: string,
  request: Request,
  event: AnalyticsEvent,
): AnalyticsEngineDataPoint {
  const cf = request.cf as AnalyticsRequestCf | undefined;
  return {
    indexes: [slug],
    blobs: [
      slug,
      request.headers.get("CF-Connecting-IP") ?? PLACEHOLDER,
      request.headers.get("Referer") ?? PLACEHOLDER,
      cf?.country ?? PLACEHOLDER,
    ],
    doubles: [event === "miss" ? 1 : 0],
  };
}

/** True when Cloudflare has already verified the request as a bot (D17). */
export function isVerifiedBot(request: Request): boolean {
  const cf = request.cf as AnalyticsRequestCf | undefined;
  return cf?.botManagement?.verifiedBot === true;
}

/**
 * Records one redirect or miss. Never lets the write affect the response: a missing
 * binding is a no-op, and `writeDataPoint` throwing — synchronously or via a rejected
 * promise — is swallowed rather than surfaced, with the actual write handed to
 * `ctx.waitUntil` so a slow write cannot delay the redirect either.
 */
export function recordAnalytics(
  analytics: AnalyticsEngineDataset | undefined,
  ctx: AnalyticsExecutionContext,
  slug: string,
  request: Request,
  event: AnalyticsEvent,
): void {
  if (!analytics || isVerifiedBot(request)) return;

  const point = buildDataPoint(slug, request, event);
  ctx.waitUntil(
    (async () => {
      try {
        await analytics.writeDataPoint(point);
      } catch {
        // Analytics is best-effort — a failing write must never surface to the client.
      }
    })(),
  );
}
