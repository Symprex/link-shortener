// The type side of virtual:links, which scripts/vite-plugin-links.ts builds from
// links/*.json at bundle time. The emitted module carries no import of its own — it has
// no location on disk for a relative specifier to resolve against — so the Link type
// reaches the Worker from here instead.
//
// Declared as a module rather than a global so an import of virtual:links type-checks
// exactly like any other module, and so tsconfig.worker.json needs no path mapping.
declare module "virtual:links" {
  const links: Record<string, import("./types.ts").Link>;
  export { links };
}
