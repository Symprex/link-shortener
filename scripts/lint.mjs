// Runs ESLint over the legacy Nuxt tree and oxlint over the new src/links tree,
// and fails if either does. Kept as a script rather than a shell one-liner in
// package.json so it behaves the same regardless of the shell running it.
import { spawnSync } from 'node:child_process'

const commands = [
  ['eslint', ['.']],
  ['oxlint', ['--no-error-on-unmatched-pattern', 'src', 'links']],
  ['oxfmt', ['--check', 'src', 'links']],
]

let failed = false

for (const [command, args] of commands) {
  const result = spawnSync('pnpm', ['exec', command, ...args], { stdio: 'inherit', shell: true })
  if (result.status !== 0)
    failed = true
}

process.exit(failed ? 1 : 0)
