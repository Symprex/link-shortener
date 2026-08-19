---
name: vue-best-practices
description: Vue 3, Composition API, and TypeScript guidance for `.vue` files, composables, page models and shared frontend code. Use for implementation detail — component decomposition, reactivity decisions, typed contracts, translations — and for Vue code review. Not for deciding where code belongs or which skill to use; that is `frontend-advisor`.
---

# Vue Best Practices

Vue implementation detail. `frontend-advisor` decides where code belongs and carries the repo-wins rule — read it first if you have not.

**The rules are in [RULES.md](RULES.md), beside this file** — wrapper components, the loader → model → view pattern, translations, and the two that bite (feature flags and success notifications). They are also emitted to `.github/instructions/` and `.claude/rules/`, so they load whenever a `.vue` file, a page model or a composable is touched, whether or not this skill fires. Read them first; this file is the *how*.

## Judgement, not rules

- **Presentational or controlling?** When a component is mostly rendering, keep it presentational and drive it from props, slices or a page model rather than local orchestration state. Route wiring, loader orchestration and page-model creation belong in the page layer.
- **When to reach for a feature folder** — once a change introduces several related files, not before.
- **Whether a component earns Storybook coverage.** Most presentational components do; see `storybook-workflows` for what a story has to prove.
- **Whether to write a composable at all.** Check VueUse and the repository's existing helpers first — most common browser and reactivity problems already have one.
- Make data flow explicit; the reference files carry the detail on reactivity, slots and fall-through attributes.

## Useful references

- The repo's own Vue and TypeScript rules, which win over anything here — `frontend-advisor` lists where to find them.
- Core reference files worth keeping nearby:
  - [`reactivity.md`](references/reactivity.md)
  - [`state-management.md`](references/state-management.md)
  - [`sfc.md`](references/sfc.md)
  - [`component-data-flow.md`](references/component-data-flow.md)
  - [`composables.md`](references/composables.md)
  - [`translations.md`](references/translations.md)
  - [`vueuse.md`](references/vueuse.md)
- Situational reference files:
  - [`component-slots.md`](references/component-slots.md)
  - [`component-fallthrough-attrs.md`](references/component-fallthrough-attrs.md)

---
*Ported from the Signature365 `vue-best-practices` skill. Reference files may cite concrete Signature365 types and paths as worked examples; treat those as illustrations, and let the consuming repo's own rules and code win.*
