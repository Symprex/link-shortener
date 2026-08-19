---
name: typescript
description: TypeScript conventions that are not Vue-specific — type assertions and why a double cast is banned, type-only imports, tsconfig project structure, and keeping a type-check fast. Use when writing or reviewing plain `.ts` or `.tsx` code, editing a tsconfig, deciding how to build a typed test fixture, or when a type-check is slow, out of memory, or reporting something unreadable. For component contracts and reactivity, use `vue-best-practices` instead.
---

# TypeScript

**The rules are in [RULES.md](RULES.md), beside this file**, and are emitted to `.github/instructions/` and `.claude/rules/`, so they load whenever a `.ts`, `.tsx` or `tsconfig` file is touched — whether or not this skill fires. Read them first; this file is the *how*.

Read the repository's own TypeScript rules before these. `frontend-advisor` lists where they live, and where they conflict, the repository wins.

## Getting a typed value without a cast

The reason `as any as T` is banned is that it is almost always reached for in a test, to build one object out of the fifteen fields a type demands. The cast makes today's test compile and makes tomorrow's field addition invisible: the type gains a required property, every honest construction site fails, and the cast sails through.

Two constructions that do the same job and keep the check:

```typescript
// A constructor that takes a partial and supplies the rest.
const invoice = new InvoiceV2({ id: 'inv_001', total: 11990 });

// A fixture helper, where the defaults are shared across a suite.
const invoice = createInvoiceV2Fixture({ id: 'inv_001', status: 'paid' });
```

Both accept `Partial<T>` and validate what you passed, so a renamed field breaks the fixture rather than hiding in it. When neither exists yet, writing the helper is the change — it pays for itself the second time the type moves.

The narrow legitimate cast is a **structural bridge**: the value really is the right shape, and the compiler cannot see it. A `DeepReadonly<T>` view handed to a parameter typed mutable is the standard case. Comment it with why it is safe, because the next reader cannot distinguish it from laziness.

## Splitting tsconfig projects

The shape that keeps type-check time and memory bounded, and the reason for each split:

| Project | Covers | Why separate |
|---|---|---|
| `tsconfig.app.json` | Source, plus specs when specs import vitest explicitly | Merging specs in is the win; it only works without test globals |
| `tsconfig.storybook.json` | `.storybook/**` and `*.stories.ts` | Storybook's declarations are large and belong to nothing else |
| `tsconfig.node.json` | `vite.config.ts` and other build config | Node module types must not appear in a DOM environment |
| `tsconfig.json` | References only | The entry point editors and CI use; it chains the rest |

A separate `tsconfig.specs.json` is a transitional state, not a target: it exists when specs still rely on `globals: true` rather than importing from `vitest`. Merging it into the app project is worth real CI time, and the blocker is always the implicit globals, so that is the thing to fix. Measure it on the repository in front of you rather than trusting a figure from another one.

The type-check script chains every project it needs:

```json
{
  "scripts": {
    "ci:typecheck": "vue-tsc --noEmit --project tsconfig.app.json && vue-tsc --noEmit --project tsconfig.storybook.json"
  }
}
```

Miss a project out of that chain and it is unchecked in CI while looking checked.

## Explicit vitest imports

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
```

Three things this buys, beyond the type-graph size:

- App code that accidentally calls `describe()` fails to compile, instead of resolving against a global that exists only because a tsconfig declared it.
- The DOM test environment stays out of the production type scope, which is where most of the declaration-file weight is.
- Each spec is legible on its own — the imports say what framework it is written against.

With `globals: true` in the vitest config, `vitest.mock()` works as a global. Under explicit imports it is `vi.mock()` from the import, and that is the substitution people miss when converting a file.

## When a type-check is slow or unreadable

The usual cause is a **generic factory inferring from a large object literal**. Inference walks every property through the wrapper types, and on a wide reactive shape that is seconds and gigabytes rather than milliseconds:

```typescript
// Slow: T must be inferred from the literal.
const view = makeView({ customer, subscription, plans });

// Fast: the explicit parameter selects the overload that returns the named type directly.
const view = makeView<CustomerView>({ customer, subscription, plans });
```

The explicit parameter is also a contract — a mismatch reports against `CustomerView` rather than as an inference failure somewhere inside the generic.

The same reasoning kills `ReturnType<typeof usePlanTabModel>`: it defeats the overload and forces the full return type to evaluate at every use site. Annotate the function and name the interface:

```typescript
export function usePlanTabModel(options: Options): PlanTabModel {
```

When a check is slow and no factory is implicated, measure before changing anything — `tsc --generateTrace` or `--extendedDiagnostics` will name the file, and the cause is frequently a `types` array pulling in something the project does not need.

---
*Adapted from the Signature365 `typescript.instructions.md`. Its `makeView`/`makeSlice` factories appear above as worked examples of a generic factory; the rule is about the shape, not those names.*
