// Shared HTML escaping for the handful of places the Worker interpolates untrusted or
// attacker-influenced text (a slug, a referer, a country code) into a server-rendered
// page. Kept as the single copy: src/index.ts's 404 page and src/admin/page.ts both use
// it rather than each carrying their own.

/** Escapes the five HTML-significant characters so untrusted text is safe as element content. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
