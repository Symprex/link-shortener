---
title: Choose Storybook, Vitest, or Browser Tests by Confidence Boundary
impact: MEDIUM
impactDescription: Picking the right verification layer keeps tests cheaper, clearer, and closer to the repo's presentational-page architecture
type: capability
tags: [vue3, testing, storybook, vitest, browser]
---

# Choose Storybook, Vitest, or Browser Tests by Confidence Boundary

**Impact: MEDIUM** - The first question is not "node or browser?" It is "what is the right confidence boundary?" Presentational scenarios usually belong in Storybook. Models, slices, composables, and small focused component contracts usually belong in Vitest. Real browser concerns belong in browser-level tests.

## Default testing split
- **Storybook:** required scenario coverage for presentational components and presentational page components.
- **Vitest:** page models, slices, composables, utilities, and small focused mounted-component tests.
- **Browser-level tests / Playwright:** layout, computed styles, native browser behaviour, route-to-route flows, and other cases where the real browser is the contract.

Small mounted tests are acceptable when the unit is narrow and Storybook would be a clumsy fit. They are not the default substitute for required presentational scenario coverage.

## Use Storybook first for presentation

Reach for Storybook when the thing you are proving is "what does this scenario render like to the user?" This fits most presentational components and presentational page components, and it keeps the verification close to the props, slices, or page model that drive the UI.

A worked example, to read as an illustration of the layout rather than a path to open in another repo:

- `frontend/apps/portal/src/modules/subscriptions/pages/plan-tab/PlanTab.stories.ts` (Signature365)

## Use Vitest for focused logic contracts

Use Vitest when the most important contract is model logic, derived state, action behaviour, a composable API, or a small mounted component interaction that does not need the full Storybook/browser environment.

Good fits include:

- page models,
- slices,
- composables,
- utilities,
- focused mounted component tests.

Concrete repo examples:

- `frontend/apps/portal/src/modules/subscriptions/pages/plan-tab/planTabModel.specs.ts`
- `frontend/apps/portal/src/openapi/testing/mockApiRequestHandler.ts`

## Escalate to browser-level tests when the browser is the contract

Reach for browser-level verification when you need:

- computed styles or layout,
- real focus/blur or drag/drop behaviour,
- cookies, file uploads, or other browser APIs,
- route transitions and multi-page flows,
- confidence that depends on the real application shell.

For these cases, use Playwright or repo-specific UI validation workflows rather than stretching a mounted test beyond its useful boundary.

## Useful repo references

- The repo's own testing rules, which win over anything here.
- [`testing-vitest-recommended-for-vue.md`](testing-vitest-recommended-for-vue.md)
- [`testing-e2e-playwright-recommended.md`](testing-e2e-playwright-recommended.md)
