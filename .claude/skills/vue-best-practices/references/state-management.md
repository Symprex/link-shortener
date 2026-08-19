---
title: State and Page-Model Strategy
impact: HIGH
impactDescription: Frontend state stays predictable when route data lives in loaders, page behaviour lives in models, and child components consume slices instead of ad hoc stores
type: best-practice
tags: [vue3, state-management, loaders, page-models, slices, composables, vueuse]
---

# State and Page-Model Strategy

**Impact: HIGH** - In this repository, state management is primarily a page-architecture concern, not a store-library choice. The default flow is **loader -> model -> view**, with slices below the page boundary. Replacing that with ad hoc global stores usually duplicates server state, fights the router/data-loader lifecycle, and makes Storybook coverage harder.

## Repo-first defaults

- Start with local component state for purely presentational concerns.
- Put route data in `defineBasicLoader(...)` loaders and let the router/data-loader system deduplicate by route key.
- Build page behaviour in `use<PageName>Model(...)` and expose `view` plus `actions`.
- Pass the full page model only to the top-level presentational page component.
- Pass slices or plain props to child components.
- Reuse generated API resources and the app's own response cache instead of building parallel client stores for the same data.
- Symprex frontends do not reach for a store library by default. Check the repo's rules before introducing Pinia; the Signature365 worked example does not use it at all.

## Route data belongs in loaders

Signature365 as the worked example: a loader is a `defineBasicLoader(...)` export from a module or shared `loaders/` folder. The matching `*Page.vue` container re-exports those loaders from its non-setup `<script lang="ts">` block so `unplugin-vue-router` can register them.

Concrete example:

- `frontend/apps/portal/src/modules/subscriptions/loaders/customer.ts`
- `frontend/apps/portal/src/modules/subscriptions/pages/plan-tab/PlanTabPage.vue`

## Page behaviour belongs in models

Page models are the stable contract between route data and rendering. They normalize loader inputs, derive view state, and expose guarded actions for the page.

Concrete example:

- `frontend/apps/portal/src/modules/subscriptions/pages/plan-tab/planTabModel.ts`

## Child components consume slices, not whole page models

Below the top-level page component, create slices that expose only the fields and actions a child needs. This keeps child APIs small, makes Storybook stories easier to build, and prevents the full page model from leaking through the component tree.

Concrete example:

- `frontend/apps/portal/src/modules/subscriptions/pages/plan-tab/planTab.slices.ts`

## Do not build parallel stores for API resources

The portal request handler already caches API resources and collections by their server-managed `self` links, and merges updates into the same reactive object instances. Before introducing any extra store or cache layer, check whether the data should instead flow through loaders, `useApiWatch`, `useApiWatchEffect`, or the existing response cache.

Concrete examples:

- `frontend/apps/portal/src/openapi/apiRequestHandler.ts`
- `frontend/apps/portal/src/boot/api.ts`

## When smaller shared state is fine

Use smaller composables or VueUse helpers for browser concerns, timers, debounced inputs, dialogs, and other UI state that is not the canonical representation of a server resource. This complements the page-model pattern rather than replacing it.

Concrete example:

- `frontend/packages/common/src/lib/useDataLossPrevention.ts`

## Useful repo references

- The repo's own frontend architecture and state rules, which win over anything here.
- [`composables.md`](composables.md)
- [`vueuse.md`](vueuse.md)
