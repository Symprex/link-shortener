---
category: Sensors
---

# useOnline

Reactive online state. A wrapper of `useNetwork`.

## Usage

```ts
import { useOnline } from '@vueuse/core'

const online = useOnline()
```

## Component Usage

```vue
<template>
  <UseOnline v-slot="{ isOnline }">
    Is Online: {{ isOnline }}
  </UseOnline>
</template>
```

## Type Declarations

```ts
/**
 * Reactive online state.
 *
 * @see vendored reference
 * @param options
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useOnline(
  options?: ConfigurableWindow,
): Readonly<ShallowRef<boolean>>
```
