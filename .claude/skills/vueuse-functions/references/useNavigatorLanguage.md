---
category: Sensors
---

# useNavigatorLanguage

Reactive navigator.language.

## Usage

```ts
import { useNavigatorLanguage } from '@vueuse/core'

const { language } = useNavigatorLanguage()

watch(language, () => {
  // Listen to the value changing
})
```

## Type Declarations

```ts
export interface NavigatorLanguageState {
  isSupported: ComputedRef<boolean>
  /**
   *
   * ISO 639-1 standard Language Code
   *
   * @info The detected user agent language preference as a language tag
   * (which is sometimes referred to as a "locale identifier").
   * This consists of a 2-3 letter base language tag that indicates a
   * language, optionally followed by additional subtags separated by
   * '-'. The most common extra information is the country or region
   * variant (like 'en-US' or 'fr-CA').
   *
   *
   * @see vendored reference
   * @see vendored reference
   *
   */
  language: ShallowRef<string | undefined>
}
/**
 *
 * Reactive useNavigatorLanguage
 *
 * Detects the currently selected user language and returns a reactive language
 * @see vendored reference
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useNavigatorLanguage(
  options?: ConfigurableWindow,
): Readonly<NavigatorLanguageState>
export type UseNavigatorLanguageReturn = ReturnType<typeof useNavigatorLanguage>
```
