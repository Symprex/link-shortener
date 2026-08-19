# Play functions

A `play` function turns a story from a picture into a proof. One meaningful assertion beats five that would pass on an empty component.

## Assert the differentiator

The question is always: *what makes this story different from `Default`, and would this assertion fail if that difference disappeared?* An assertion that the component rendered passes on every story in the file and proves nothing about any of them.

```typescript
export const WithNoResults: Story = {
    args: { ...Default.args },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // The differentiator: the empty state, not the table.
        expect(await canvas.findByText('No matching members')).toBeVisible();
        expect(canvas.queryByRole('row')).toBeNull();
    },
};
```

## Query choice

- `findBy*` when the element appears asynchronously — it waits.
- `getBy*` when it must already be there — it fails immediately, which is what you want.
- `queryBy*` only to assert absence. It is the one that returns `null` instead of throwing.
- `await` every async operation. An un-awaited `findBy*` passes regardless.

## Scoping

- `within(canvasElement)` for anything the component rendered.
- `within(screen)` for anything the framework teleported out of the canvas — dialogs, menus, dropdowns, tooltips. A dialog assertion scoped to `canvasElement` fails with the dialog plainly visible on screen, which is a confusing half-hour.

## What to assert on

In order of preference: visible text, accessible name, role, state, status. These are what a user perceives, and they survive refactoring.

Reach for `data-testid` only when the differentiator has no stable user-meaningful hook. A test id asserts that the markup is unchanged, not that the feature works.

Never assert on a CSS class or an icon count. Both change for visual reasons that have nothing to do with behaviour.

## The feature-flag trap

**Do not assert the presence, count or visibility of anything behind a feature flag** unless that flag's state is explicit for the story.

Whether a flag is on depends on what the Storybook config loaded into `import.meta.env`, which differs per app and changes without anyone touching the story. The story then passes locally and fails in CI, or worse, passes in CI for a reason nobody intended.

If a story needs a flag in a known state, set it in the story. If it does not, assert on text or labels rather than on counts of things a flag might add or remove.
