---
title: Use Playwright for Full-Flow Browser Verification
impact: MEDIUM
impactDescription: Playwright is the right escalation path when Storybook or focused Vitest tests cannot prove a real browser flow
type: best-practice
tags: [vue3, testing, playwright, browser, end-to-end]
---

# Use Playwright for Full-Flow Browser Verification

**Impact: MEDIUM** - In this repo, Playwright is not the starting point for every component. Start with Storybook scenario verification for presentational components and focused Vitest tests for logic-heavy units. Escalate to Playwright when you need confidence in a real browser flow, route transitions, or browser APIs that Storybook and mounted tests cannot prove well enough.

## Repo-first testing order

- Storybook `play` verification for required presentational scenarios.
- Focused Vitest tests for page models, slices, composables, utilities, and small mounted-component contracts.
- Playwright for full app flows, real browser behaviour, and cross-page verification.

Use the `webapp-testing` skill when you need repo-specific local E2E workflows for Portal/Admin/Partner applications.

## Use Playwright when one of these is true

- The behaviour spans multiple routes, dialogs, or browser tabs.
- You need real browser primitives such as drag/drop, focus management, cookies, file upload, or viewport/layout behaviour.
- The verification depends on the full application shell rather than an isolated story.
- A Storybook or mounted test would become more artificial than helpful.

## Selector priority

- Prefer user-meaningful selectors first: `getByRole`, `getByLabel`, `getByText`.
- Prefer stable ARIA/state hooks before adding custom selectors.
- Add `data-testid` only when no stable accessible hook exists for the thing you need to verify.

```typescript
import { expect, test } from '@playwright/test';

test('user can update a card from the subscriptions flow', async ({ page }) => {
    await page.goto('/subscriptions');

    await page.getByRole('button', { name: /update card/i }).click();
    await expect(page.getByRole('dialog', { name: /update card/i })).toBeVisible();
});
```

## Where to go next

- The `webapp-testing` skill for the local end-to-end validation playbook, and `playwright-cli` for the commands.
- The repo's own testing rules, which win over anything here.
- [`testing-browser-vs-node-runners.md`](testing-browser-vs-node-runners.md)
