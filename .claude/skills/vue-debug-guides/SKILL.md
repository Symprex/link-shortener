---
name: vue-debug-guides
description: Vue-specific failure mechanics — runtime warnings, stale reactivity, lost reactivity from destructuring, watcher flush timing, async cleanup, hydration mismatches, route-driven state going stale. Use when a Vue bug's shape is known and you need the mechanism. For building the failing loop first, use `diagnosing-bugs`; for new implementation, `vue-best-practices`.
---

# Vue Debug Guides

Use this skill when the main task is diagnosis.

## Required workflow

- Start with `diagnosing-bugs` discipline: reproduce, isolate, and understand the issue before changing code.
- Once the cause is clear and the fix changes behaviour, use `test-driven-development` to drive the implementation.
- Before claiming the UI bug is fixed or the flow is ready for review, use `verifying-work`.

## Debug workflow

1. Reproduce the issue in the smallest page, story, component, or test that still fails.
2. Check the reactive boundary first: destructuring, `.value` usage, computed side effects, stale watchers, or `markRaw` needs.
3. Check component contracts: `defineProps`, `defineEmits`, `defineModel`, event names, and `v-model` wiring.
4. Check routing and loader behaviour when params or navigation are involved.
5. Check Storybook and test-environment differences if the issue only appears outside the main app.

## Repo-specific checks

- Route and page issues often come from violating the loader -> model -> view pattern.
- Expected API failures should use generated `errorTypes`.
- Feature-flag behaviour should go through the feature-flag helpers, not direct env access.
- Storybook assertions should avoid brittle checks against feature-flag-gated icons or classes.
- Dialogs, teleports, and dropdowns may need screen-level queries or Storybook-specific interaction patterns.
- Manual DOM listeners, resize handlers, clipboard code, and timer logic may be a sign that a VueUse composable should replace bespoke code.

## Companion skills

- `diagnosing-bugs` for the cross-cutting root-cause-first workflow.
- `test-driven-development` when the diagnosis turns into a behaviour-changing fix.
- `verifying-work` before success claims or handoff.
- `vue-router-best-practices` for route-lifecycle and loader issues.
- `vue-testing-best-practices` for flaky tests and interaction timing problems.
- `vue-best-practices` when the fix needs structural cleanup after diagnosis.
- `vueuse-functions` when the fix should replace manual browser/reactivity wiring with VueUse.

## Useful references

- Reference files worth keeping nearby:
  - [`reactivity-debugging-hooks.md`](references/reactivity-debugging-hooks.md)
  - [`reactive-destructuring.md`](references/reactive-destructuring.md)
  - [`computed-no-side-effects.md`](references/computed-no-side-effects.md)
  - [`watch-async-cleanup.md`](references/watch-async-cleanup.md)
  - [`watch-flush-timing.md`](references/watch-flush-timing.md)
  - [`cleanup-side-effects.md`](references/cleanup-side-effects.md)
  - [`composable-tovalue-inside-watcheffect.md`](references/composable-tovalue-inside-watcheffect.md)
  - [`ssr-hydration-mismatch-causes.md`](references/ssr-hydration-mismatch-causes.md)

---
*Ported from the Signature365 `vue-debug-guides` skill. Reference files may cite concrete Signature365 types and paths as worked examples; treat those as illustrations, and let the consuming repo's own rules and code win.*
