---
title: Translation and Formatting
impact: HIGH
impactDescription: Hard-coded English, ad hoc namespaces, and manual date/number formatting create inconsistent UI and break localisation
type: best-practice
tags: [vue3, i18n, i18next, translation, formatting]
---

# Translation and Formatting

**Impact: HIGH** - User-facing English should not be hard coded in Vue components, page models, or composables. This repo uses a shared `i18next` layer exposed through `useTranslation(...)`, plus formatting helpers for dates, ranges, numbers, percentages, and currency.

## Repo-first rules

- Use `const { $t } = useTranslation('namespace');` for user-facing strings.
- Never assemble translated sentences by concatenating English fragments in code.
- Use interpolation and formatting inside translation strings instead of calling `toLocaleString()` or hand-formatting dates and amounts.
- Prefer `STranslatedText` for longer translated prose or strings that intentionally contain markup/placeholders.

## Namespace rules

`useTranslation(...)` takes a namespace, and it also supports a `namespace:prefix` form.

Examples:

- `useTranslation('subscriptions')` -> `$t('title')` resolves inside the `subscriptions` namespace.
- `useTranslation('common:visual-editor.qr')` -> `$t('label')` resolves to `common:visual-editor.qr.label`.
- If you need to bypass the prefix, use `$t('/some.other-key')`.

If you omit the namespace, the component tree must already provide one. Otherwise `useTranslation()` throws.

## Where translation keys live

For app code, the translation files live under `src/i18n/<language>/`.

Current repo layout:

- Portal app: `frontend/apps/portal/src/i18n/en-GB/portal.yml`
- Admin app: `frontend/apps/admin/src/i18n/en-GB/admin-portal.yml`
- Partners app: `frontend/apps/partners/src/i18n/en-GB/partners.yml`
- Outlook app: `frontend/apps/outlook/src/signature-365/i18n/en-GB/outlook.yml`
- Common package: `frontend/packages/common/src/i18n/en-GB/shared.yml` plus package-specific files such as `styleguide.yml`

Rule of thumb:

- `frontend/packages/common/src/i18n/.../shared.yml` is only for strings owned by components shipped from the common package.
- App-specific feature, page, domain, shared-component, and dialog strings belong in that app's main translation file.
- Common-package strings belong in the common package's own translation files.

## Formatting values in translations

Use i18next interpolation formats inside translation files:

- `{{ count, number }}`
- `{{ total, currency }}`
- `{{ when, date }}`
- `{{ when, date-relative }}`

Concrete repo examples:

- `frontend/apps/portal/src/i18n/en-GB/portal.yml` uses `{{ autoChosen, number }}`, `{{ total, currency }}`, and `{{ when, date }}`
- `frontend/packages/common/src/i18n/en-GB/shared.yml` uses `{{ from, date }} - {{ to, date }}

## Formatting values in code

When the formatting happens in script rather than interpolation, use the helpers from `useTranslation(...)` and the global i18n layer:

- `$td(value, DateFormat.Date)` for date-only text
- `$td(value, DateFormat.DateTime)` for date/time text
- `$td(value, DateFormat.DateRelative)` for relative dates
- `$tdr(from, to, DateFormat.Date)` for date ranges
- `$tn(value)` for numbers
- `$tp(value)` for percentages
- `$tc({ amount, currency })` for currency

## Useful repo references

- `frontend/packages/common/src/boot/i18n.ts`
- `frontend/packages/common/src/i18n/index.ts`
- `frontend/packages/common/src/components/STranslatedText.vue`
- `frontend/apps/portal/src/i18n/en-GB/portal.yml`
- `frontend/apps/portal/src/i18n/en-GB/shared.yml`
