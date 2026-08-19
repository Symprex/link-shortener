---
name: create-adaptable-composable
description: Design reusable Vue composables that accept maybe-reactive inputs — `MaybeRef`, `MaybeRefOrGetter`, `toRef`, `toValue` — with typed, injectable, testable contracts. Use when authoring a library-grade or cross-feature composable, not a page-only helper. For picking an existing VueUse composable instead of writing one, use `vueuse-functions`.
---

# Create Adaptable Composable

Use this skill when a composable should accept plain values, refs, or getters.

## Rules

- Accept external dependencies as parameters; do not hide them behind `inject` when the composable can take them directly.
- Use clear option and return interfaces.
- Keep the API small and predictable.
- Test API-driven composables against the repo's mock request handler — see `vue-testing-best-practices`.
- Prefer `vueuse-functions` first when the need is a browser or reactivity primitive rather than a repo-specific shared composable contract.

## Choosing the input type

- Use `MaybeRefOrGetter<T>` for read-only inputs that can be a value, ref, computed, or getter.
- Use `MaybeRef<T>` for writable/two-way inputs.
- If the argument may itself be a callback, predicate, or comparator, do not use `MaybeRefOrGetter` because it can be mistaken for a getter.

## Normalisation guidance

- Normalise maybe-reactive inputs with `toRef()` or `toValue()` inside reactive effects.
- At page-model boundaries, prefer the repo's existing model helpers such as `useModelInput` when that pattern already exists.
- Avoid mixing page-model concerns and generic composable concerns in the same function.

## Design checklist

- Can the composable stay pure apart from its explicit dependencies?
- Is the input shape obvious to callers?
- Does the output expose only the state and actions that consumers need?
- Would a page-model helper be a better fit than a shared composable?

## Useful references

- Worked examples and the fuller rationale: [`create-adaptable-composable.md`](references/create-adaptable-composable.md)
- Related skill: `vueuse-functions`
- Related local Vue references:
  - [`composables.md`](../vue-best-practices/references/composables.md)
  - [`composable-tovalue-inside-watcheffect.md`](../vue-debug-guides/references/composable-tovalue-inside-watcheffect.md)

---
*Ported from the Signature365 `create-adaptable-composable` skill. Reference files may cite concrete Signature365 types and paths as worked examples; treat those as illustrations, and let the consuming repo's own rules and code win.*
