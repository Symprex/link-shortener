---
title: Adaptable Composables — Types and Worked Examples
impact: MEDIUM
impactDescription: A composable that only accepts plain values forces callers to unwrap refs at every call site, and one that mistakes a callback for a getter invokes it at the wrong time
type: capability
tags: [vue3, composables, maybe-ref, reactivity, typescript]
---

# Adaptable Composables — Types and Worked Examples

The decision rules live in the skill body. This file carries the type definitions and the code.

## Type utilities

```ts
/**
 * value or writable ref (value/ref/shallowRef/writable computed)
 */
export type MaybeRef<T = any> = T | Ref<T> | ShallowRef<T> | WritableComputedRef<T>;

/**
 * MaybeRef<T> + ComputedRef<T> + () => T
 */
export type MaybeRefOrGetter<T = any> = MaybeRef<T> | ComputedRef<T> | (() => T);
```

Resolve a reactive value — a watcher source, say — with `toRef()`. Resolve a non-reactive read with `toValue()`.

## Read-only input: `MaybeRefOrGetter`

```ts
import { watch, toRef } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

export function useDocumentTitle(title: MaybeRefOrGetter<string>) {
  watch(toRef(title), (t) => {
    document.title = t
  }, { immediate: true })
}
```

## Two-way writable input: `MaybeRef`

```ts
import { toRef } from 'vue'
import type { MaybeRef } from 'vue'

export function useCounter(count: MaybeRef<number>) {
  const countRef = toRef(count)
  function add() {
    countRef.value++
  }
  return { add }
}
```

## DOM and element targets

Use `MaybeRefOrGetter` when the target may be derived — `() => wrapper.value?.querySelector('.row')` — so callers are not forced to precompute a ref.
