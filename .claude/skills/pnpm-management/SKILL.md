---
name: pnpm-management
description: Manage pnpm dependencies through the pnpm CLI only — adding, removing, updating, listing, auditing, `--filter` scoping, catalogs and `overrides`, and minimal-diff CVE remediation. Use for any dependency or lockfile change in a pnpm workspace. Never hand-edit package.json or pnpm-lock.yaml.
---

# pnpm Management

## When to Use This Skill

Use this skill when you need to manage pnpm dependencies in frontend/workspace packages, especially for:

- Adding or removing dependencies in one or more workspace packages
- Updating vulnerable or outdated packages (for example CVE remediation)
- Auditing dependency vulnerabilities across selected packages or the full workspace
- Applying package operations safely with `--filter` scoping

**The rules are in [RULES.md](RULES.md), beside this file** — never hand-edit the lockfile, find the workspace root first, scope with `--filter`. They are also emitted to `.github/instructions/` and `.claude/rules/`, so they load whenever a `package.json`, lockfile or workspace file is touched, whether or not this skill fires. Read them first; this file is the *how*.

> Signature365, as a worked example, has two workspaces and no root one: `frontend/pnpm-workspace.yaml` for apps, packages and tools, and `devops/pnpm-workspace.yaml` for infrastructure and CI.

**Package names in the examples below are Signature365's** (`@symprex/portal`, `@symprex/admin-portal`). Substitute the workspace package names from the repo you are in.

Prefer:

- `pnpm add ...`
- `pnpm remove ...`
- `pnpm update ...` / `pnpm up ...`
- `pnpm ls ...`
- `pnpm why ...`
- `pnpm outdated ...`
- `pnpm audit ...`

Avoid:

- Manual JSON/lockfile edits (bypasses pnpm's dependency resolution and can corrupt workspace consistency)
- Mixing core npm/yarn commands into pnpm workflows (creates lockfile/tooling drift and makes installs non-reproducible). Put repo-wide overrides in `pnpm-workspace.yaml`, not `package.json`.

## Workflow

Follow this sequence:

1. Identify scope: one package, a selected set of packages, or the whole workspace.
2. Choose the matching pnpm command (`add`, `remove`, `update`, `ls`, `outdated`, `audit`).
3. Apply workspace filtering (`--filter`) as needed.
4. Verify result with listing/audit commands and run relevant CI scripts for affected packages.

## Command Cookbook

### Add dependencies

```powershell
# Add runtime dependency to one package
pnpm --filter @symprex/portal add lodash --save-catalog

# Add dev dependency to one package
pnpm --filter @symprex/portal add -D vitest --save-catalog

# Add dependency to several packages
pnpm --filter @symprex/portal --filter @symprex/admin-portal add lodash --save-catalog

# Add to workspace root package
pnpm -w add -D wrangler
```

### Remove dependencies

```powershell
# Remove from one package
pnpm --filter @symprex/portal remove lodash

# Remove from several packages
pnpm --filter @symprex/portal --filter @symprex/admin-portal remove lodash
```

### Update dependencies

```powershell
# Update one dependency to a fixed version (for CVE remediation)
pnpm --filter @symprex/portal update axios@0.30.2

# Update within declared ranges
pnpm --filter @symprex/portal update axios

# Update to latest regardless of current range
pnpm --filter @symprex/portal update axios --latest
```

### List and inspect dependencies

```powershell
# List direct dependencies across workspace packages
pnpm ls -r --depth 0

# Show outdated dependencies across workspace
pnpm outdated -r

# Show outdated dependencies in one package
pnpm --filter @symprex/portal outdated

# Find a specific dependency
pnpm why -r axios
```

### Audit vulnerabilities

```powershell
# Audit all workspace packages
pnpm audit -r

# Audit high/critical only
pnpm audit -r --audit-level=high
```

### Override specific package versions (security/CVE)

Use overrides only when a vulnerable transitive dependency cannot be resolved by a normal package update.

**Do NOT run `pnpm audit --fix` in security PRs unless the user explicitly asked for a broader dependency refresh.** It performs an undirected update across all vulnerabilities and introduces unrelated package bumps into the lockfile diff.

#### Minimal-diff vulnerability remediation workflow

Follow this sequence to keep lockfile diffs minimal and reviewable:

1. **Inspect the dependency path** — identify exactly which packages pull in the vulnerable version:
   ```powershell
   pnpm why -r <vulnerable-package>
   ```

2. **Prefer a direct or targeted update** — upgrade the direct dependency that introduces the vulnerability, when possible:
   ```powershell
   pnpm --filter @symprex/portal... update <direct-dep>@<safe-version>
   ```

3. **Use a scoped override only if a direct update is not possible** — set it in the `overrides:` block of the workspace that owns the dependency, using `parent>child` selectors:
   ```yaml
   # pnpm-workspace.yaml
   overrides:
     'pacote>tar': '7.5.9'
     '@kubernetes/client-node>tar': '7.5.9'
   ```

4. **Regenerate the lockfile**:
   ```powershell
   pnpm install
   ```

5. **Inspect the override and lockfile diff** before proceeding:
   ```powershell
   git diff -- pnpm-workspace.yaml pnpm-lock.yaml
   ```

6. **Reject unrelated bumps** — if either diff contains changes outside the intended override or vulnerable dependency subtree, **stop and report** rather than committing them. Unrelated package changes must not be silently bundled into a security PR.

7. **Verify the remediation**:
   ```powershell
   pnpm audit -r --audit-level=high
   pnpm why <vulnerable-package>
   ```

#### Removing temporary overrides

```powershell
# Remove the override from pnpm-workspace.yaml once the upstream fix is available, then reinstall
pnpm install
```

### Resolving transitive dependencies

- Always check to see if upgrading a primary dependency will resolve the downstream dependency.
- Avoid adding overrides with `>=` syntax as this can inadvertently introduce breaking changes when shifting between major versions.
- Do not apply a blanket override to a transitive dependency used across multiple version ranges.
- Never force a single version of a dependency when multiple major versions are intentionally present.
- Identify the specific dependency path(s) that require fixing and apply scoped overrides using `parent>child` selectors.
- When multiple major versions exist, restrict the fix to the affected version using `package@<major>` syntax rather than unifying all versions.
- Ensure overrides only affect the vulnerable branch and do not modify unrelated dependency paths.

## Workspace Filtering Patterns

Use filters to target exactly the right packages:

```powershell
# Single package
pnpm --filter @symprex/portal <command>

# Package and its local dependencies/dependents
pnpm --filter @symprex/portal... <command>

# Multiple packages
pnpm --filter @symprex/portal --filter @symprex/admin-portal <command>
```

## Example Requests to Execute

### CVE patch update

User request: `I need to update axios from 0.30.1 to 0.30.2 to resolve a critical CVE.`

Execute:

```powershell
pnpm --filter @symprex/portal update axios@0.30.2
pnpm --filter @symprex/portal outdated axios
pnpm --filter @symprex/portal run ci:test:unit
```

### Install a package into selected projects

User request: `Install lodash into the workspace and reference it in a particular set of projects.`

Execute:

```powershell
pnpm --filter @symprex/portal --filter @symprex/admin-portal add lodash --save-catalog
pnpm --filter @symprex/portal --filter @symprex/admin-portal ls lodash --depth 0
```

### Workspace vulnerability audit

User request: `Perform an audit of packages with vulnerabilities across the entire workspace.`

Execute:

```powershell
pnpm audit -r --audit-level=low
```

## Validation After Changes

After dependency changes, run affected checks instead of unrelated full-suite runs. Take the script names from the repo — the matching scope's `test` and `typecheck` in `.symprex/config.json`, or the workspace `package.json` scripts:

```powershell
# Targeted checks, using Signature365's script names
pnpm --filter @symprex/portal... run ci:typecheck
pnpm --filter @symprex/portal... run ci:test:unit
```

---
*Ported from the Signature365 `pnpm-management` skill.*
