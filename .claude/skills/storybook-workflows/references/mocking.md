# Mocking, fixtures and shared mocks

The names below are one repo's; the shapes transfer. Find the equivalents in the repo's `.storybook/decorators/` and its fixtures directories before writing a mock by hand.

## The API decorator

Repos with a generated API client usually have a Storybook decorator that injects a mocked client into the app context — commonly `withApi`. Define the mocks per story file, or per story where only some variants need them.

```typescript
import { withApi } from '../../.storybook/decorators/withApi';
import { createUserFixture } from 'src/openapi/testing/fixtures/createUserOrGroupFixture';

const meta = {
    decorators: [
        withApi((handler) => {
            handler
                .mock((api) => api.search.searchMembers(''))
                .ok({ values: [createUserFixture()] });
        }),
    ],
} satisfies Meta<typeof Component>;
```

- One `handler.mock(...)` captures **one** operation.
- `.ok(...)` for success, `.error(new Error('…'))` for a thrown failure, `.reply(status, data)` for a non-200.
- `.times(n)` when the component calls the same endpoint more than once, `.times(-1)` for unlimited. A component that calls twice against a single-use mock fails on the second call, which reads as a component bug.
- Return only the fields the component uses. A fixture returning the whole DTO hides which fields actually matter.

Story-level decorators **merge with** meta-level ones rather than replacing them, so a variant can override one endpoint and inherit the rest:

```typescript
export const WithEmptyResults: Story = {
    args: { ...Default.args },
    decorators: [
        withApi((handler) => {
            handler.mock((api) => api.search.searchMembers('')).ok({ values: [] });
        }),
    ],
};
```

## Fixtures, not inline objects

Prefer an existing fixture over an inline literal every time. Repos typically tier them by scope:

| Tier | Scope |
|---|---|
| Shared | Cross-module data types — countries, platform-wide DTOs |
| Module | Types belonging to one module — a customer, a subscription |
| Generated API | The generated DTOs used with the API mock decorator |

If the fixture does not exist, create it in the right tier rather than inlining. Conventions:

- Use the generated class where there is one.
- Deterministic defaults representing the realistic common case.
- Accept an `overrides` parameter so a story adjusts only what differs.
- No unused properties.

## Form-property mocks

Field wrappers that read validation state from something like `form.getProperty(key)` need a specific shape. Use the repo's shared helper rather than inlining it in every story — inlined, it drifts the moment the wrapper's contract changes, and every story fails at once for a reason none of them explains.

```typescript
import { createMockFormProperty } from 'src/modules/subscriptions/fixtures/createMockFormProperty';

function createMockForm(data: Record<string, unknown> = {}) {
    return {
        data: { ...data },
        validate: () => {},
        getProperty: (key: string) => createMockFormProperty(key),
    } as never;
}
```

## Share a mock between a page story and its child's

When a page story renders a child that already has stories, **export the child's mock creator** and compose from it:

```typescript
// PlanDetailsCard.stories.ts — export it
export function createSliceMock(overrides?: Partial<PlanDetailsCardSlice>): PlanDetailsCardSlice { … }

// PlanTab.stories.ts — reuse it
import { createSliceMock } from '../components/PlanDetailsCard.stories';
```

Two mocks for one component is two things to update and one to forget. Sharing means a change to the child's contract surfaces in the parent's story immediately, rather than leaving the page story asserting against a shape that no longer exists.
