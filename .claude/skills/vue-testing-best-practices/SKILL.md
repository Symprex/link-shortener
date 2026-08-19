---
name: vue-testing-best-practices
description: Vue testing guidance for Vitest — test placement, mock and fixture design, composable and page-model specs, fake timers and effect scopes. Use when adding or reviewing Vue component tests, composable tests, or frontend coverage. For story selection and `play` assertions use `storybook-workflows`; for driving the running app use `webapp-testing`.
---

# Vue Testing Best Practices

Use this skill for frontend tests and story-driven verification.

**The rules are in [RULES.md](RULES.md), beside this file** — explicit imports, no transport stubbing, the shared timer and scope helpers, and which harness proves what. They are also emitted to `.github/instructions/` and `.claude/rules/`, so they load whenever a spec file is touched, whether or not this skill fires. Read them first; this file is the *how*.

## Required workflow

- Use `test-driven-development` before changing frontend production behaviour.
- Use `diagnosing-bugs` before patching unexpected Vitest, Storybook, browser, or runtime failures.
- Use `verifying-work` before claiming frontend work is fixed, passing, or ready for review.

## Choosing where a behaviour is proved

The rules say which harness suits which unit. The judgement is what "proves it" means for the thing in front of you:

- A **presentational component** proves its scenarios in Storybook, with `play` functions doing the asserting. Reach for a mounted test when the unit is small or the contract is genuinely easier to express outside a story — not because Storybook is unfamiliar.
- A **page model** is logic with reactivity attached, so it is a Vitest subject even though it renders nothing.
- Use the repository's Storybook API decorator when the component consumes the generated API — Signature365 calls it `withApi`.
- [`testing-vue-timers-and-scope.md`](references/testing-vue-timers-and-scope.md) carries the timer and effect-scope mechanics, including why `flushPromises()` hangs under fake timers.

## When the spec is fighting you

A component spec that will not go green without a growing pile of stubs is reporting a design problem, and reading it as a testing problem is how the pile grows. The question to ask is *what am I actually asserting?* — and if the answer is a decision the component made, the decision belongs in the page model, where it can be asserted without a DOM at all.

The rules say a wiring-only wrapper spec is usually not worth keeping, and that reliably feels wrong, so it is worth being precise about what such a spec does and does not buy.

Most of what it can catch, `vue-tsc` catches sooner and with a better message: a renamed prop, a required prop dropped, a value of the wrong type. What survives the type-check is narrow — forwarding the wrong same-typed value, or dropping an optional prop — and that is a real class of bug, so the rule says *usually* rather than *always*. Where a wrapper genuinely guards one of those, keep the spec and say in it which mistake it is guarding.

What the spec cannot do is tell you the feature works, because everything it touches is a mock of something else. So the question is not "could this ever fail?" but "is this the cheapest place to catch what it catches?" — and for a wrapper whose failure modes are all type errors, it is not.

Keep the wrapper spec when it renders real children and asserts something a reader would recognise as behaviour.

## Required validation

Take the commands from the repo: the matching scope's `test`, `lint` and `typecheck` in `.symprex/config.json`, or the scripts in the workspace `package.json`. Run the narrowest selection that proves the change, then the scope's whole-suite commands before review.

Signature365 exposes these as `pnpm run ci:lint`, `ci:typecheck`, `ci:test:unit` and `ci:test:storybook`.

## Companion skills

- `test-driven-development` for the red-green-refactor loop on frontend behaviour changes.
- `diagnosing-bugs` when the failure shape is unclear and you need diagnosis before fixing.
- `verifying-work` before claiming the frontend slice is green or review-ready.
- `storybook-workflows` for story planning and interaction-test design.
- `vue-best-practices` for component structure and contracts.
- `vue-debug-guides` for flaky or timing-sensitive failures.
- `webapp-testing` for full app/browser validation beyond Storybook and focused Vitest tests.

## Useful references

- Reference files worth keeping nearby:
  - [`testing-vitest-recommended-for-vue.md`](references/testing-vitest-recommended-for-vue.md)
  - [`testing-component-blackbox-approach.md`](references/testing-component-blackbox-approach.md)
  - [`testing-async-await-flushpromises.md`](references/testing-async-await-flushpromises.md)
  - [`testing-composables-helper-wrapper.md`](references/testing-composables-helper-wrapper.md)
  - [`testing-vue-timers-and-scope.md`](references/testing-vue-timers-and-scope.md)
  - [`testing-no-snapshot-only.md`](references/testing-no-snapshot-only.md)
  - [`testing-e2e-playwright-recommended.md`](references/testing-e2e-playwright-recommended.md)
  - [`testing-browser-vs-node-runners.md`](references/testing-browser-vs-node-runners.md)

---
*Ported from the Signature365 `vue-testing-best-practices` skill. Reference files may cite concrete Signature365 types and paths as worked examples; treat those as illustrations, and let the consuming repo's own rules and code win.*
