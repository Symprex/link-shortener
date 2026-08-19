---
name: vue-router-best-practices
description: Vue Router mechanics — module route plugins, `unplugin-vue-router`, data loaders, route params, navigation guards and route lifecycle. Use when adding or changing routes, loaders and page containers, or when navigation and stale-route data misbehave. For deciding which module owns a route, use `frontend-advisor`.
---

# Vue Router Best Practices

Use this skill for routing and route-boundary work in frontend apps.

## Required repo context

Read the repo's own routing rules first — `frontend-advisor` lists where to find them, and they win over anything here. Symprex frontends generally use module-owned route contributions and a loader -> model -> view page pattern.

Where `unplugin-vue-router` is in use, "data loaders" are `defineBasicLoader(...)` exports from `src/**/loaders/*.ts`, and the matching `*Page.vue` route container re-exports them from its non-setup `<script lang="ts">` block so the plugin can register them. Confirm the repo actually uses that plugin before relying on the mechanic.

**The rules are in [RULES.md](RULES.md), beside this file** — module ownership, loader export placement, where route data lives, and the instance-reuse trap. They are also emitted to `.github/instructions/` and `.claude/rules/`, so they load whenever a page container, loader or route file is touched, whether or not this skill fires. Read them first; this file is the *how*.

## Judgement

- **How far to split a page.** A page component should not become a mega-component: push rendering and slices below the page boundary. Where that boundary sits is a decision, not a rule.
- **Whether the route is in the right module at all** — `frontend-advisor` owns that call, and a cross-module import is the usual first symptom.

## Companion skills

- `frontend-advisor` for module ownership and decomposition decisions.
- `vue-best-practices` for general component and reactivity guidance.
- `vue-debug-guides` for stale-route or lifecycle debugging.

## Useful references

- Worked examples from Signature365, to read as illustrations of the pattern rather than paths to open in another repo: `frontend/apps/portal/src/modules/subscriptions/pages/plan-tab/PlanTabPage.vue` and `frontend/apps/portal/src/modules/subscriptions/loaders/customer.ts`.
- Reference files worth keeping nearby:
  - [`router-beforeenter-no-param-trigger.md`](references/router-beforeenter-no-param-trigger.md)
  - [`router-guard-async-await-pattern.md`](references/router-guard-async-await-pattern.md)
  - [`router-navigation-guard-infinite-loop.md`](references/router-navigation-guard-infinite-loop.md)
  - [`router-navigation-guard-next-deprecated.md`](references/router-navigation-guard-next-deprecated.md)
  - [`router-param-change-no-lifecycle.md`](references/router-param-change-no-lifecycle.md)

---
*Ported from the Signature365 `vue-router-best-practices` skill. Reference files may cite concrete Signature365 types and paths as worked examples; treat those as illustrations, and let the consuming repo's own rules and code win.*
