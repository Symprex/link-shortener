// Runs once before the `redirect` project's tests. Compiles the fixtures in
// src/test/fixtures/links/ into src/links.generated.ts (the same generator the real
// deploy uses — see scripts/generate-links.ts) so the Worker under test resolves
// slugs from a controlled fixture set rather than the real links/ directory.
import { fileURLToPath } from "node:url";
import { generateLinks } from "../../scripts/generate-links.ts";

export default function setup(): void {
  const sourceDir = fileURLToPath(new URL("./fixtures/links", import.meta.url));
  const outFile = fileURLToPath(new URL("../links.generated.ts", import.meta.url));
  generateLinks(sourceDir, outFile);
}
