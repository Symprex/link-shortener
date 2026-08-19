---
title: Shared Vue Test Helpers — useVueTimers and useTestScope
impact: MEDIUM
impactDescription: Hand-rolled fake-timer and effect-scope setup is verbose, easy to get subtly wrong, and leaks fake timers or scopes between tests when teardown is forgotten
type: capability
tags: [vue3, testing, vitest, fake-timers, effect-scope, using, symbol-dispose]
---

# Shared Vue Test Helpers — `useVueTimers` and `useTestScope`

**Impact: MEDIUM** — Specs that exercise debounced watchers or run a composable/model outside a
component repeat `vi.useFakeTimers()` / `advanceTimersByTimeAsync` / `nextTick` / `vi.useRealTimers()`
and manual `effectScope` setup/teardown. Two shared `using`-based helpers make the intent obvious and
make disposal unforgettable.

What transfers is the pattern: put fake-timer and effect-scope teardown behind a `using`-based helper in the repo's shared testing package, so disposal cannot be forgotten. Check whether the repo already has such helpers before writing your own — and if it does, use its names, not the ones below.

The names and import paths throughout this file are Signature365's, where the two helpers live in `@symprex/common/testing`:

- `useVueTimers()` — `@symprex/common/testing/vueTimers`
- `useTestScope()` — `@symprex/common/testing/testScope`

## When to use

- **`useVueTimers()`** — any spec that needs Vitest fake timers: debounced watchers, TTL/date-sensitive
  logic (`{ now }` pins the clock), or timer cascades (`runAll()`).
- **`useTestScope()`** — any spec that runs a composable or model outside a component and must dispose
  the reactive effects afterwards (previously `effectScope().run(...)` … `scope.stop()`).

## Task checklist

- [ ] Declare the helper with `using` so disposal cannot be forgotten (`using timers = useVueTimers()`).
- [ ] Advance + settle a watcher with `await timers.waitForWatch(debounceMs)` — never `flushPromises()` under fake timers.
- [ ] Run a composable/model with `scope.run(() => useThing(...))`.
- [ ] Flush a scope test yourself: `waitForWatch()` under fake timers, or `await flushPromises()` under real timers.
- [ ] If you must assert an effect of disposal (e.g. an aborted `AbortSignal`), call `scope.stop()` explicitly before the assertion.
- [ ] If the `using` binding is never referenced, name it `_timers` / `_scope` so the unused-var lint is satisfied.

## Before

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';

describe('useSurveyPreview', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers(); // easy to forget — leaks fake timers into later tests
    });

    it('loads the preview after the debounce', async () => {
        const scope = effectScope();
        const preview = scope.run(() => useSurveyPreview({ api, fields }))!;

        await vi.advanceTimersByTimeAsync(600);
        await nextTick();

        expect(preview.previewHtml.value).toBe('<div>preview</div>');
        scope.stop(); // easy to forget — leaks the scope
    });
});
```

## After

```typescript
import { describe, expect, it } from 'vitest';
import { useVueTimers } from '@symprex/common/testing/vueTimers';
import { useTestScope } from '@symprex/common/testing/testScope';

describe('useSurveyPreview', () => {
    it('loads the preview after the debounce', async () => {
        using timers = useVueTimers();
        using scope = useTestScope();

        const preview = scope.run(() => useSurveyPreview({ api, fields }));

        await timers.waitForWatch(600);

        expect(preview.previewHtml.value).toBe('<div>preview</div>');
        // real timers restored and the scope stopped automatically at block exit
    });
});
```

## Anti-patterns these helpers prevent

- **Forgotten `vi.useRealTimers()` / `scope.stop()`.** The `using` disposal runs at block exit no matter
  how the test ends. Do not reintroduce `beforeEach`/`afterEach` timer pairs in new specs.
- **`flushPromises()` under fake timers hangs.** `@vue/test-utils` `flushPromises` awaits a macrotask that
  never fires while timers are faked. `waitForWatch()` uses `vi.advanceTimersByTimeAsync` (which drains
  microtasks between timer callbacks). `useTestScope()` never flushes internally, so it composes with
  `useVueTimers()` without deadlocking.
- **Asserting after disposal.** With `using`, disposal happens *after* the test body. If the assertion
  depends on disposal having run, call `scope.stop()` explicitly first (it is idempotent, so the `using`
  disposal then no-ops).

## Prerequisite

`using` / `Symbol.dispose` require `"ESNext.Disposable"` in the `lib` array of the relevant
`tsconfig.app.json`. Add it to every project whose specs use the helpers. The runtime (Node) and the
Vitest transform (esbuild/oxc) both lower `using` natively — no polyfill needed.

## Reference

Signature365's implementations, as a worked example: `frontend/packages/common/src/testing/vueTimers.ts` and `frontend/packages/common/src/testing/testScope.ts`.
