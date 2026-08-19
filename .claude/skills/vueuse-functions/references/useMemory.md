---
category: Browser
---

# useMemory

Reactive Memory Info.

## Usage

```ts
import { useMemory } from '@vueuse/core'

const { isSupported, memory } = useMemory()
```

## Type Declarations

```ts
/**
 * Performance.memory
 *
 * @see vendored reference
 */
export interface MemoryInfo {
  /**
   * The maximum size of the heap, in bytes, that is available to the context.
   */
  readonly jsHeapSizeLimit: number
  /**
   *  The total allocated heap size, in bytes.
   */
  readonly totalJSHeapSize: number
  /**
   * The currently active segment of JS heap, in bytes.
   */
  readonly usedJSHeapSize: number
  [Symbol.toStringTag]: "MemoryInfo"
}
export interface UseMemoryOptions extends ConfigurableScheduler {
  /**
   * Start the timer immediately
   *
   * @deprecated Please use `scheduler` option instead
   * @default true
   */
  immediate?: boolean
  /**
   * Execute the callback immediately after calling `resume`
   *
   * @deprecated Please use `scheduler` option instead
   * @default false
   */
  immediateCallback?: boolean
  /** @deprecated Please use `scheduler` option instead */
  interval?: number
}
export interface UseMemoryReturn {
  isSupported: ComputedRef<boolean>
  memory: Ref<MemoryInfo | undefined>
}
/**
 * Reactive Memory Info.
 *
 * @see vendored reference
 * @param options
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useMemory(options?: UseMemoryOptions): UseMemoryReturn
```
