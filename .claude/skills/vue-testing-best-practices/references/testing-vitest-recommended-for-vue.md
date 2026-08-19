---
title: Use the Repo's Existing Vitest Setup
impact: MEDIUM
impactDescription: Reusing the repository's existing Vitest patterns keeps frontend tests aligned with Storybook, explicit imports, and generated API helpers
type: best-practice
tags: [vue3, testing, vitest, repo-patterns]
---

# Use the Repo's Existing Vitest Setup

**Impact: MEDIUM** - Vitest is already the repo standard for focused frontend tests. The important question here is not how to install it, but where it fits: Storybook covers required presentational scenarios, while Vitest covers page models, slices, composables, utilities, and small mounted-component tests.

## Repo-first defaults

- Use explicit imports from `vitest`; do not rely on globals.
- Reuse the existing app/test configuration instead of adding a new runner or setup tutorial.
- For presentational component scenario coverage, default to Storybook `play` verification.
- Use `@vue/test-utils` only when a small mounted test is the clearest way to prove the contract.
- For generated-API composables, inject dependencies and test with `MockApiRequestHandler`.
- Run the existing scripts such as `pnpm run ci:test:unit` and `pnpm run ci:test:storybook`.

## Good fits for Vitest
- page models and derived state,
- slices,
- composables,
- utility functions,
- focused mounted-component tests,
- generated API wrappers and request flows tested via mocks.

## Concrete repo references

Signature365 as the worked example:

- `frontend/apps/portal/src/openapi/testing/mockApiRequestHandler.ts`
- `frontend/apps/portal/src/modules/subscriptions/pages/plan-tab/planTabModel.specs.ts`

## Small example of the expected style

```typescript
import { describe, expect, it } from 'vitest';

describe('usePlanTabModel', () => {
    it('derives the current plan details', () => {
        expect(true).toBe(true);
    });
});
```

The important part is the style, not the placeholder assertion:

- explicit `vitest` imports,
- focused behaviour-oriented assertions,
- no setup tutorial noise,
- repo patterns first.
