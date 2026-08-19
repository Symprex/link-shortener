---
name: frontend-advisor
description: Primary entry point for frontend work in a Symprex repo. Use this first for any Vue, component, routing, or frontend structural request to route into the right specialist skill while keeping the repository's own frontend rules authoritative. Also covers where frontend code belongs — modules, page boundaries, loaders, slices and feature folders.
---

# Frontend advisor

Start here for any frontend task. This skill routes and decides structure; the specialist skills carry the detail.

**The rules are in [RULES.md](RULES.md), beside this file** — the repo-wins rule, the design-system obligations, and where code belongs. They are also emitted to `.github/instructions/` and `.claude/rules/`, so they load whenever a `.vue` or `.tsx` file is touched, whether or not this skill fires. Read them first; this file routes and decides.

## Finding the component library

`components` in `.symprex/config.json` names it: `docs` to read, `sourceDir` for the real sources, `tokens` for the real palette, `importFrom` for the specifier.

If the key is absent, look for a shared package with its own naming prefix and a token or theme stylesheet, and **say that you inferred it**. If the repository genuinely wraps nothing, use the framework directly and say so — do not invent a prefix. Either way, record what you found in `components` so the next session does not repeat the search.

## Routing table

| If the task involves… | Use |
|---|---|
| Vue implementation, component decomposition, reactivity, `<script setup>`, component contracts, translations | `vue-best-practices` |
| Type assertions, type-only imports, tsconfig projects, a slow or unreadable type-check | `typescript` |
| Routes, route plugins, loaders, route params, navigation guards, stale route data | `vue-router-best-practices` |
| Vitest, component tests, composable tests, mock design, coverage decisions | `vue-testing-best-practices` |
| Story selection, `play` assertions, fixtures, story titles | `storybook-workflows` |
| Reusable composables taking maybe-reactive inputs (`MaybeRef`, `MaybeRefOrGetter`) | `create-adaptable-composable` |
| Choosing a VueUse composable instead of hand-rolling a browser or reactivity helper | `vueuse-functions` |
| Adding, removing, updating or auditing packages in a pnpm workspace | `pnpm-management` |
| Driving a browser from the command line — navigate, snapshot, screenshot, extract | `playwright-cli` |
| Validating a UI change end to end, reproducing a bug in the running app, capturing evidence | `webapp-testing` |
| Vue warnings, stale reactivity, watcher problems, component contract mistakes | `vue-debug-guides` |

The cross-cutting Symprex practices apply throughout and activate on their own: `test-driven-development`, `verifying-work`, `diagnosing-bugs`, `code-review`.

## Deciding where code belongs

The boundaries themselves are in the rules. The order of the decision is here:

1. Decide the owning module.
2. Decide whether the change belongs in shared code or module code.
3. Decide whether the new behaviour needs a route plugin, loader, page model, presentational component, slice, or reusable library helper.
4. Keep route containers thin and move rendering into presentational components.
5. Use feature folders once the change spans multiple related files.

## Cross-skill defaults

- Most feature work needs `vue-best-practices` plus `vue-testing-best-practices`, and `storybook-workflows` when the change is visible.
- Route or page work adds `vue-router-best-practices`.
- Diagnosis starts with `diagnosing-bugs` — build the failing loop first — then `vue-debug-guides` for the Vue-specific mechanics.
- Browser verification pairs `webapp-testing` for the playbook with `playwright-cli` for the commands.

---
*Ported from the Signature365 `frontend-architecture` skill, with repo-specific instruction paths replaced by the repo-wins rule above and the routing and design-system guidance absorbed from the Signature365 `design-system` skill.*
