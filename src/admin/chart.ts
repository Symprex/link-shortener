// The clicks-over-time chart (D6, T12): a server-rendered inline SVG, no client
// JavaScript and no chart library. Two pure functions, each independently testable:
// fillDailySeries turns the daily-clicks query's rows into one point per calendar day —
// Analytics Engine returns no row for a day with no clicks, so a gap must be filled with
// zero rather than skipped — and renderClicksChart turns that series into markup.
import { escapeHtml } from "../html.ts";
import type { WindowDays } from "./queries.ts";
import { windowStart } from "./queries.ts";

/**
 * One row of the daily-clicks query's result: a UTC calendar day (`YYYY-MM-DD`, the shape
 * buildDailyClicksQuery's `formatDateTime(timestamp, '%Y-%m-%d', 'Etc/UTC')` produces) and
 * its hit count for that day.
 */
export interface DailyClicksRow {
  day: string;
  clicks: number;
}

/** One point of the zero-filled series the chart draws: a calendar day and its click count. */
export interface DailyClicksPoint {
  date: string;
  clicks: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Turns the daily-clicks query's rows into one point per day across the full window,
 * ending today and in chronological order. Rows landing on the same calendar day are
 * summed; a day the query returned no row for renders as zero rather than being skipped.
 *
 * Anchored to queries.ts's windowStart — the same instant buildDailyClicksQuery bounds its
 * SQL to (T12 must-fix) — rather than computing its own "now minus N days", so the query's
 * time bound and the chart's day buckets can never disagree about what a day is.
 */
export function fillDailySeries(
  rows: readonly DailyClicksRow[],
  days: WindowDays,
  now: Date = new Date(),
): DailyClicksPoint[] {
  const clicksByDate = new Map<string, number>();
  for (const row of rows) {
    clicksByDate.set(row.day, (clicksByDate.get(row.day) ?? 0) + row.clicks);
  }

  const start = windowStart(days, now).getTime();
  const points: DailyClicksPoint[] = [];
  for (let i = 0; i < days; i++) {
    const date = toDateKey(new Date(start + i * DAY_MS));
    points.push({ date, clicks: clicksByDate.get(date) ?? 0 });
  }
  return points;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const VIEWBOX_WIDTH = 600;
const VIEWBOX_HEIGHT = 200;
const PADDING = 12;

/**
 * Renders a zero-filled series as an inline SVG line chart: pure markup, no client
 * JavaScript and no chart library, sized by viewBox/preserveAspectRatio so it scales in
 * the Pico-styled page around it. Guards the two degenerate cases the spec calls out: an
 * all-zero series (no divide-by-zero when scaling the y axis) and a single-day series (no
 * divide-by-zero when spacing points along the x axis).
 */
export function renderClicksChart(points: readonly DailyClicksPoint[]): string {
  const maxClicks = Math.max(0, ...points.map((point) => point.clicks));
  const innerWidth = VIEWBOX_WIDTH - PADDING * 2;
  const innerHeight = VIEWBOX_HEIGHT - PADDING * 2;
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  const coordinates = points.map((point, index) => {
    const x = PADDING + index * stepX;
    const y =
      maxClicks > 0
        ? PADDING + innerHeight - (point.clicks / maxClicks) * innerHeight
        : PADDING + innerHeight;
    return { x: round(x), y: round(y), point };
  });

  const polylinePoints = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const dots = coordinates
    .map(
      ({ x, y, point }) =>
        `<circle cx="${x}" cy="${y}" r="2.5"><title>${escapeHtml(point.date)}: ${point.clicks}</title></circle>`,
    )
    .join("");

  return `<svg viewBox="0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="clicks-chart-title">
        <title id="clicks-chart-title">Clicks per day</title>
        <polyline fill="none" stroke="currentColor" stroke-width="2" points="${polylinePoints}" />
        ${dots}
      </svg>`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
