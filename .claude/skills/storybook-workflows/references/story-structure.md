# Story structure, titles and MDX

## Meta

```typescript
const meta = {
    title: 'Portal/Modules/Subscriptions/Components/PlanDetailsCard',
    component: PlanDetailsCard,
    tags: ['autodocs'],
    argTypes: {
        variant: { control: 'select', options: ['filled', 'outline'] },
        disabled: { control: 'boolean', description: 'Blocks interaction and dims the control.' },
    },
} satisfies Meta<typeof PlanDetailsCard>;

export default meta;
type Story = StoryObj<typeof meta>;
```

`satisfies Meta<typeof Component>` rather than `as Meta` — it type-checks `args` against the real props instead of silently accepting anything.

## Titles mirror the source path

The title hierarchy follows the folder structure exactly, under the app's root segment. Read a sibling story file for the root rather than guessing it.

```
Portal/Modules/Subscriptions/Components/PlanDetailsCard
Portal/Modules/Subscriptions/Pages/PlanTab/PlanTab
```

A presentational page component gets `.../Pages/[Page]/[Component]` with **no** `Components/` segment — it is the page, not a component within it.

Getting this wrong does not error. The story appears in the wrong place in the sidebar, where nobody looking for it will find it.

## Files sit beside the component

```
src/components/forms/
├── AddressDetails.vue
└── AddressDetails.stories.ts
```

## Documentation

- Let `tags: ['autodocs']` generate the API table. Do not restate it.
- Prop descriptions go in `argTypes`, where autodocs picks them up.
- Keep `parameters.docs.description` short. A long prose block here is documentation nobody edits when the component changes.
- Brief inline comments for a complex setup are worth it.

## MDX: pipe tables do not render

`.mdx` documentation pages — introductions, token catalogues — **do not render Markdown pipe tables.** They come out as literal pipe characters on the page. It looks like a build problem and it is not.

```mdx
{/* Bad — renders as raw pipes */}
| Column A | Column B |
|----------|----------|
| value    | value    |
```

```mdx
{/* Good */}
<table>
  <thead>
    <tr><th>Column A</th><th>Column B</th></tr>
  </thead>
  <tbody>
    <tr><td>value</td><td>value</td></tr>
  </tbody>
</table>
```

This applies only to `.mdx`. Pipe tables in ordinary Markdown are fine.
