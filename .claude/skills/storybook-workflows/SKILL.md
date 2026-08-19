---
name: storybook-workflows
description: Storybook guidance for which components get stories and which do not, the container/content split that makes dialogs and pages testable, required state coverage, play-function assertions, API mocks and fixtures, story titles, and the MDX traps. Use when adding or reviewing stories, or designing browser-visible scenario proof. For Vitest specs and mock design use vue-testing-best-practices.
---

# Storybook workflows

Use this skill when Storybook is part of the task.

**The rules are in [RULES.md](RULES.md), beside this file** — which components get stories, which states, the `play`-function requirement, and not inventing the story command. They are also emitted to `.github/instructions/` and `.claude/rules/`, so they load whenever a story or MDX file is touched, whether or not this skill fires. Read them first; this file is the *how*.

The repo's own Storybook rules win over anything here; `frontend-advisor` lists where to find them, and `components` in `.symprex/config.json` points at the component set the stories are for.

## Writing the assertion

The `play` function has to prove the scenario's *differentiator*. A story called "Empty" that asserts the component rendered has proved nothing about emptiness. See [references/play-functions.md](references/play-functions.md) for the patterns and the traps.

## When "no stories" is a design finding

A component that owns both its lifecycle and its markup cannot be story-booked at all. The answer is the container/content split, not an exemption — and that decomposition belongs to `frontend-advisor` and `vue-best-practices`. Raising it as a design finding is usually more valuable than adding a thin story to the container.

## Model-backed components

If a component takes a `model` prop, the story **instantiates the real model** and mocks its inputs — API handlers, route state, navigation and dialog services, feature flags, clocks.

Do not hand-build an object literal that imitates the model's `view` and `actions` to satisfy the prop. It compiles, it renders, and it drifts from production the first time the real model changes — after which the story proves the mock still matches itself.

## Accessibility

Every story is also the cheapest accessibility check available, because the a11y addon runs on it:

- Semantic HTML rather than styled `div`s.
- An accessible name on every interactive element.
- Keyboard operable.
- Contrast at 4.5:1 or better.

## References

- [references/story-structure.md](references/story-structure.md) — meta configuration, story titles, file placement, autodocs, and the MDX table trap.
- [references/play-functions.md](references/play-functions.md) — scenario assertions, query choice, scoping, and the feature-flag trap.
- [references/mocking.md](references/mocking.md) — the API-mock decorator, fixture tiers, form-property mocks, and sharing a mock between a page story and its child's.

## Companion skills

- `test-driven-development` when the story or `play` assertion is part of the proving loop for a bug fix or new behaviour.
- `verifying-work` before claiming the scenario proof is sufficient.
- `vue-testing-best-practices` for testing strategy and where the boundary between Storybook and Vitest sits.
- `frontend-advisor` for component decomposition before stories are written, and for the repo's wrapper-component rule.

---
*Ported from the Signature365 `storybook-workflows` skill and its Storybook instructions, with the repo-specific story command and title root replaced by config lookups.*
