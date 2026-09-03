// The link file contract documented in docs/links.md. Shared between the Worker
// (src/redirect.ts) and the build-time generator (scripts/generate-links.ts) so both
// sides of the generated bundle agree on the shape without either importing the other's
// runtime.
export interface Link {
  url: string;
  slug: string;
  comment?: string;
}
