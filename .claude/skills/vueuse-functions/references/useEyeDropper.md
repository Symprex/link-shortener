---
category: Browser
---

# useEyeDropper

Reactive EyeDropper API

## Usage

```ts
import { useEyeDropper } from '@vueuse/core'

const { isSupported, open, sRGBHex } = useEyeDropper()
```

## Component Usage

```vue
<template>
  <UseEyeDropper v-slot="{ isSupported, sRGBHex, open }">
    <button :disabled="!isSupported" @click="() => open()">
      sRGBHex: {{ sRGBHex }}
    </button>
  </UseEyeDropper>
</template>
```

## Type Declarations

```ts
export interface EyeDropperOpenOptions {
  /**
   * @see vendored reference
   */
  signal?: AbortSignal
}
export interface EyeDropper {
  new (): EyeDropper
  open: (options?: EyeDropperOpenOptions) => Promise<{
    sRGBHex: string
  }>
  [Symbol.toStringTag]: "EyeDropper"
}
export interface UseEyeDropperOptions {
  /**
   * Initial sRGBHex.
   *
   * @default ''
   */
  initialValue?: string
}
/**
 * Reactive EyeDropper API
 *
 * @see vendored reference
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useEyeDropper(options?: UseEyeDropperOptions): {
  isSupported: ComputedRef<boolean>
  sRGBHex: ShallowRef<string, string>
  open: (openOptions?: EyeDropperOpenOptions) => Promise<
    | {
        sRGBHex: string
      }
    | undefined
  >
}
export type UseEyeDropperReturn = ReturnType<typeof useEyeDropper>
```
