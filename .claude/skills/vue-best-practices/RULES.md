---
globs:
  - "**/*.vue"
  - "**/*Model.ts"
  - "**/use*.ts"
---

# Vue components and page models

**Read the repository's own Vue and TypeScript rules first** — `frontend-advisor` lists where they live. Where they conflict with anything here, the repository wins.

- Vue 3, Composition API, `<script setup lang="ts">`.
- Use the repository's own wrapper components rather than raw framework components — the design-system rules own that, and are emitted from `frontend-advisor`.
- Follow the loader → model → view pattern for page work. `*Page.vue` route containers stay thin: loaders and page-model creation there, rendering in the matching presentational component.
- **Pass the full page model only at the page boundary.** Below it, components take slices or plain props.
- Type contracts with `defineProps`, `defineEmits` and `defineModel`.
- Derive state with `computed` before reaching for a watcher.
- **`export` does not compile inside `<script setup>`.** Where a component must export a type or an enum, add a plain `<script lang="ts">` block beside the setup block and put the exports there.

# Strings

- **Never leave user-facing English hard coded** in a component, page model or composable. Use `useTranslation(...)`, the translation files, and the formatting helpers.
- Strings for shared components belong in the shared package's translation file; app-specific strings — including app-shared dialogs and components — belong in that app's own file.
- Use i18next interpolation and the formatting helpers for dates, ranges, numbers, percentages and currency. **Never assemble a translated sentence by concatenation** — word order is not universal.

# Comments in a template

- **An inline template comment is the exception, not the norm.** Keep one only where a change made in ignorance of it would break something, or where the markup deviates from normal practice for a non-obvious reason. Most comments are noise a reader steps over, and they rot as soon as the markup around them moves.
- When you keep one, state the constraint as it is now, in a line or two. Never what the markup used to be. Design rationale and the history of a layout belong in the commit message, the pull request or the spec.

# Documented exports

- **Every exported function and interface in a composable, page model or utility module carries a JSDoc block** saying what it is and why it exists — the problem it solves or the component it serves. Not a restatement of the signature, which the signature already gives you.

# Two that bite

- **Never read a feature flag out of `import.meta.env` directly.** Go through the repository's feature-flag helpers, so the flag has one definition and can be faked in a test. A new flag goes in the repository's committed env file, never the gitignored local one — otherwise it is invisible to every other engineer and to CI — and it needs declaring to the story and test harness separately, because that harness does not load the env files.
- **Only show a success notification when the user specifically wants one.** Default to surfacing errors only; a success toast on every action trains people to dismiss without reading.

<!--
Mechanisable, and therefore interim, per adr/0016. Most of this section is a strong
oxlint candidate, and the frontend is where linting will pay back fastest:

- `import.meta.env` feature-flag reads — no-restricted-syntax on the member expression.
- hard-coded user-facing strings in templates — an i18n lint rule; imperfect on edge cases
  but catches the common ones.
- concatenated translated sentences — detectable where a `t()` call is an operand of `+`.
- full page model passed below the page boundary — not statically detectable in general.
- JSDoc on every export — an eslint/oxlint jsdoc rule expresses this exactly. Prefer
  turning it on over carrying the bullet.
- `export` inside `<script setup>` — the Vue compiler already errors on it, so this bullet
  exists to save the round trip rather than to enforce anything.
- a template comment that only restates the line beneath it — not mechanisable, and the
  most common form of the mistake.
-->

---
*Ported from the Signature365 `vue-best-practices` skill.*
