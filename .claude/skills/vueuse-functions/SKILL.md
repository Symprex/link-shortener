---
name: vueuse-functions
description: Catalogue of VueUse composables, for choosing an existing one instead of hand-rolling a browser or reactivity helper. Use when Vue work needs timers, clipboard, event listeners, resize observers, debouncing, async state or similar utilities. For designing a new composable of your own, use `create-adaptable-composable`.
---

# VueUse Functions

Use this skill when a Vue task needs a composable for browser APIs, timing, viewport or element measurement, async state, or small reactive utilities.

The repo's own rules on composables and shared helpers win over anything here; `frontend-advisor` lists where to find them.

## Boundaries

- VueUse complements the loader -> model -> view architecture; it does not replace loaders, page models, slices, or generated API helpers.
- Where the repo has its own reactive API-loading helpers, prefer those when the problem is reactive generated-API loading rather than a generic async task. (Signature365 calls them `useApiWatch(...)` / `useApiWatchEffect(...)`.)
- Prefer local state or page-model state over VueUse global-state helpers for domain data.
- Check the app's auto-import configuration before adding manual imports.

## Worked examples

These are from Signature365 — read them as illustrations of the mapping, not as paths to open in another repo:

- `useDataLossPrevention.ts` in the shared package -> `useEventListener(...)`
- a clipboard-copy component -> `useClipboard(...)`
- a preview component that reacts to its own size -> `useResizeObserver(...)`
- a page showing elapsed time -> `useNow()`

## Decision rules

- If the problem is browser state, browser events, timers, observers, or small reactive utilities, check the vendored VueUse catalogue below first.
- If the problem is route data loading, use loaders.
- If the problem is deriving page behaviour from loader data, use a page model.
- If the problem is tracking generated API calls reactively, prefer the repo's own API-watch helpers.
- If the problem is shared domain state, do not jump straight to VueUse global-state helpers; check whether a page model, slice, or smaller local state is the correct boundary instead.

## Vendored VueUse function catalogue

<!-- BEGIN GENERATED VUEUSE CATALOGUE -->

> Generated from `vueuse/vueuse@11edb3490497989bfa17c3cde4897f7041345308` by `plugins/symprex-frontend/skills/vueuse-functions/scripts/update-vueuse-skill.mjs`.
> Edit the Symprex guidance outside the generated markers; rerun the script to refresh this catalogue.
This skill is a decision-and-implementation guide for VueUse composables in Vue.js / Nuxt projects. It maps requirements to the most suitable VueUse function, applies the correct usage pattern, and prefers composable-based solutions over bespoke code to keep implementations concise, maintainable, and performant.

## When to Apply

- Apply this skill whenever assisting user development work in Vue.js / Nuxt.
- Always check first whether a VueUse function can implement the requirement.
- Prefer VueUse composables over custom code to improve readability, maintainability, and performance.
- Map requirements to the most appropriate VueUse function and follow the function’s invocation rule.
- Please refer to the `Invocation` field in the below functions table. For example:
  - `AUTO`: Use automatically when applicable.
  - `EXPLICIT_ONLY`: Use only when explicitly requested by the user.
    > _NOTE_ User instructions in the prompt or `AGENTS.md` may override a function’s default `Invocation` rule.

## Functions

All functions listed below are part of the VueUse library, each section categorizes functions based on their functionality.

IMPORTANT: Each function entry includes a short `Description` and a detailed `Reference`. When using any function, always consult the corresponding document in `./references` for Usage details and Type Declarations.

### State

| Function | Description | Invocation |
|----------|-------------|------------|
| [`createGlobalState`](./references/createGlobalState.md) | Keep states in the global scope to be reusable across Vue instances | AUTO |
| [`createInjectionState`](./references/createInjectionState.md) | Create global state that can be injected into components | AUTO |
| [`createSharedComposable`](./references/createSharedComposable.md) | Make a composable function usable with multiple Vue instances | AUTO |
| [`injectLocal`](./references/injectLocal.md) | Extended `inject` with ability to call `provideLocal` to provide the value in the same component | AUTO |
| [`provideLocal`](./references/provideLocal.md) | Extended `provide` with ability to call `injectLocal` to obtain the value in the same component | AUTO |
| [`useAsyncState`](./references/useAsyncState.md) | Reactive async state | AUTO |
| [`useDebouncedRefHistory`](./references/useDebouncedRefHistory.md) | Shorthand for `useRefHistory` with debounced filter | AUTO |
| [`useLastChanged`](./references/useLastChanged.md) | Records the timestamp of the last change | AUTO |
| [`useLocalStorage`](./references/useLocalStorage.md) | Reactive LocalStorage | AUTO |
| [`useManualRefHistory`](./references/useManualRefHistory.md) | Manually track the change history of a ref when the using calls `commit()` | AUTO |
| [`useRefHistory`](./references/useRefHistory.md) | Track the change history of a ref | AUTO |
| [`useSessionStorage`](./references/useSessionStorage.md) | Reactive SessionStorage | AUTO |
| [`useStorage`](./references/useStorage.md) | Create a reactive ref that can be used to access & modify LocalStorage or SessionStorage | AUTO |
| [`useStorageAsync`](./references/useStorageAsync.md) | Reactive Storage in with async support | AUTO |
| [`useThrottledRefHistory`](./references/useThrottledRefHistory.md) | Shorthand for `useRefHistory` with throttled filter | AUTO |

### Elements

| Function | Description | Invocation |
|----------|-------------|------------|
| [`useActiveElement`](./references/useActiveElement.md) | Reactive `document.activeElement` | AUTO |
| [`useDocumentVisibility`](./references/useDocumentVisibility.md) | Reactively track `document.visibilityState` | AUTO |
| [`useDraggable`](./references/useDraggable.md) | Make elements draggable | AUTO |
| [`useDropZone`](./references/useDropZone.md) | Create a zone where files can be dropped | AUTO |
| [`useElementBounding`](./references/useElementBounding.md) | Reactive bounding box of an HTML element | AUTO |
| [`useElementSize`](./references/useElementSize.md) | Reactive size of an HTML element | AUTO |
| [`useElementVisibility`](./references/useElementVisibility.md) | Tracks the visibility of an element within the viewport | AUTO |
| [`useIntersectionObserver`](./references/useIntersectionObserver.md) | Detects that a target element's visibility | AUTO |
| [`useMouseInElement`](./references/useMouseInElement.md) | Reactive mouse position related to an element | AUTO |
| [`useMutationObserver`](./references/useMutationObserver.md) | Watch for changes being made to the DOM tree | AUTO |
| [`useParentElement`](./references/useParentElement.md) | Get parent element of the given element | AUTO |
| [`useResizeObserver`](./references/useResizeObserver.md) | Reports changes to the dimensions of an Element's content or the border-box | AUTO |
| [`useWindowFocus`](./references/useWindowFocus.md) | Reactively track window focus with `window.onfocus` and `window.onblur` events | AUTO |
| [`useWindowScroll`](./references/useWindowScroll.md) | Reactive window scroll | AUTO |
| [`useWindowSize`](./references/useWindowSize.md) | Reactive window size | AUTO |

### Browser

| Function | Description | Invocation |
|----------|-------------|------------|
| [`useBluetooth`](./references/useBluetooth.md) | Reactive Web Bluetooth API | AUTO |
| [`useBreakpoints`](./references/useBreakpoints.md) | Reactive viewport breakpoints | AUTO |
| [`useBroadcastChannel`](./references/useBroadcastChannel.md) | Reactive BroadcastChannel API | AUTO |
| [`useBrowserLocation`](./references/useBrowserLocation.md) | Reactive browser location | AUTO |
| [`useClipboard`](./references/useClipboard.md) | Reactive Clipboard API | AUTO |
| [`useClipboardItems`](./references/useClipboardItems.md) | Reactive Clipboard API | AUTO |
| [`useColorMode`](./references/useColorMode.md) | Reactive color mode (dark / light / customs) with auto data persistence | AUTO |
| [`useCssSupports`](./references/useCssSupports.md) | SSR compatible and reactive `CSS.supports` | AUTO |
| [`useCssVar`](./references/useCssVar.md) | Manipulate CSS variables | AUTO |
| [`useDark`](./references/useDark.md) | Reactive dark mode with auto data persistence | AUTO |
| [`useEventListener`](./references/useEventListener.md) | Use EventListener with ease | AUTO |
| [`useEyeDropper`](./references/useEyeDropper.md) | Reactive EyeDropper API | AUTO |
| [`useFavicon`](./references/useFavicon.md) | Reactive favicon | AUTO |
| [`useFileDialog`](./references/useFileDialog.md) | Open file dialog with ease | AUTO |
| [`useFileSystemAccess`](./references/useFileSystemAccess.md) | Create and read and write local files with FileSystemAccessAPI | AUTO |
| [`useFullscreen`](./references/useFullscreen.md) | Reactive Fullscreen API | AUTO |
| [`useGamepad`](./references/useGamepad.md) | Provides reactive bindings for the Gamepad API | AUTO |
| [`useImage`](./references/useImage.md) | Reactive load an image in the browser | AUTO |
| [`useMediaControls`](./references/useMediaControls.md) | Reactive media controls for both `audio` and `video` elements | AUTO |
| [`useMediaQuery`](./references/useMediaQuery.md) | Reactive Media Query | AUTO |
| [`useMemory`](./references/useMemory.md) | Reactive Memory Info | AUTO |
| [`useObjectUrl`](./references/useObjectUrl.md) | Reactive URL representing an object | AUTO |
| [`usePerformanceObserver`](./references/usePerformanceObserver.md) | Observe performance metrics | AUTO |
| [`usePermission`](./references/usePermission.md) | Reactive Permissions API | AUTO |
| [`usePreferredColorScheme`](./references/usePreferredColorScheme.md) | Reactive prefers-color-scheme media query | AUTO |
| [`usePreferredContrast`](./references/usePreferredContrast.md) | Reactive prefers-contrast media query | AUTO |
| [`usePreferredDark`](./references/usePreferredDark.md) | Reactive dark theme preference | AUTO |
| [`usePreferredLanguages`](./references/usePreferredLanguages.md) | Reactive Navigator Languages | AUTO |
| [`usePreferredReducedMotion`](./references/usePreferredReducedMotion.md) | Reactive prefers-reduced-motion media query | AUTO |
| [`usePreferredReducedTransparency`](./references/usePreferredReducedTransparency.md) | Reactive prefers-reduced-transparency media query | AUTO |
| [`useScreenOrientation`](./references/useScreenOrientation.md) | Reactive Screen Orientation API | AUTO |
| [`useScreenSafeArea`](./references/useScreenSafeArea.md) | Reactive `env(safe-area-inset-*)` | AUTO |
| [`useScriptTag`](./references/useScriptTag.md) | Creates a script tag | AUTO |
| [`useShare`](./references/useShare.md) | Reactive Web Share API | AUTO |
| [`useSSRWidth`](./references/useSSRWidth.md) | Used to set a global viewport width which will be used when rendering SSR components that rely on the viewport width like [`useMediaQuery`](./references/useMediaQuery.md) or [`useBreakpoints`](./references/useBreakpoints.md) | AUTO |
| [`useStyleTag`](./references/useStyleTag.md) | Inject reactive `style` element in head | AUTO |
| [`useTextareaAutosize`](./references/useTextareaAutosize.md) | Automatically update the height of a textarea depending on the content | AUTO |
| [`useTextDirection`](./references/useTextDirection.md) | Reactive dir of the element's text | AUTO |
| [`useTitle`](./references/useTitle.md) | Reactive document title | AUTO |
| [`useUrlSearchParams`](./references/useUrlSearchParams.md) | Reactive URLSearchParams | AUTO |
| [`useVibrate`](./references/useVibrate.md) | Reactive Vibration API | AUTO |
| [`useWakeLock`](./references/useWakeLock.md) | Reactive Screen Wake Lock API | AUTO |
| [`useWebNotification`](./references/useWebNotification.md) | Reactive Notification | AUTO |
| [`useWebWorker`](./references/useWebWorker.md) | Simple Web Workers registration and communication | AUTO |
| [`useWebWorkerFn`](./references/useWebWorkerFn.md) | Run expensive functions without blocking the UI | AUTO |

### Sensors

| Function | Description | Invocation |
|----------|-------------|------------|
| [`onClickOutside`](./references/onClickOutside.md) | Listen for clicks outside of an element | AUTO |
| [`onElementRemoval`](./references/onElementRemoval.md) | Fires when the element or any element containing it is removed from the DOM | AUTO |
| [`onKeyStroke`](./references/onKeyStroke.md) | Listen for keyboard keystrokes | AUTO |
| [`onLongPress`](./references/onLongPress.md) | Listen for a long press on an element | AUTO |
| [`onStartTyping`](./references/onStartTyping.md) | Fires when users start typing on non-editable elements | AUTO |
| [`useBattery`](./references/useBattery.md) | Reactive Battery Status API | AUTO |
| [`useDeviceMotion`](./references/useDeviceMotion.md) | Reactive DeviceMotionEvent | AUTO |
| [`useDeviceOrientation`](./references/useDeviceOrientation.md) | Reactive DeviceOrientationEvent | AUTO |
| [`useDevicePixelRatio`](./references/useDevicePixelRatio.md) | Reactively track `window.devicePixelRatio` | AUTO |
| [`useDevicesList`](./references/useDevicesList.md) | Reactive enumerateDevices listing available input/output devices | AUTO |
| [`useDisplayMedia`](./references/useDisplayMedia.md) | Reactive `mediaDevices.getDisplayMedia` streaming | AUTO |
| [`useElementByPoint`](./references/useElementByPoint.md) | Reactive element by point | AUTO |
| [`useElementHover`](./references/useElementHover.md) | Reactive element's hover state | AUTO |
| [`useFocus`](./references/useFocus.md) | Reactive utility to track or set the focus state of a DOM element | AUTO |
| [`useFocusWithin`](./references/useFocusWithin.md) | Reactive utility to track if an element or one of its decendants has focus | AUTO |
| [`useFps`](./references/useFps.md) | Reactive FPS (frames per second) | AUTO |
| [`useGeolocation`](./references/useGeolocation.md) | Reactive Geolocation API | AUTO |
| [`useIdle`](./references/useIdle.md) | Tracks whether the user is being inactive | AUTO |
| [`useInfiniteScroll`](./references/useInfiniteScroll.md) | Infinite scrolling of the element | AUTO |
| [`useKeyModifier`](./references/useKeyModifier.md) | Reactive Modifier State | AUTO |
| [`useMagicKeys`](./references/useMagicKeys.md) | Reactive keys pressed state | AUTO |
| [`useMouse`](./references/useMouse.md) | Reactive mouse position | AUTO |
| [`useMousePressed`](./references/useMousePressed.md) | Reactive mouse pressing state | AUTO |
| [`useNavigatorLanguage`](./references/useNavigatorLanguage.md) | Reactive navigator.language | AUTO |
| [`useNetwork`](./references/useNetwork.md) | Reactive Network status | AUTO |
| [`useOnline`](./references/useOnline.md) | Reactive online state | AUTO |
| [`usePageLeave`](./references/usePageLeave.md) | Reactive state to show whether the mouse leaves the page | AUTO |
| [`useParallax`](./references/useParallax.md) | Create parallax effect easily | AUTO |
| [`usePointer`](./references/usePointer.md) | Reactive pointer state | AUTO |
| [`usePointerLock`](./references/usePointerLock.md) | Reactive pointer lock | AUTO |
| [`usePointerSwipe`](./references/usePointerSwipe.md) | Reactive swipe detection based on PointerEvents | AUTO |
| [`useScroll`](./references/useScroll.md) | Reactive scroll position and state | AUTO |
| [`useScrollLock`](./references/useScrollLock.md) | Lock scrolling of the element | AUTO |
| [`useSpeechRecognition`](./references/useSpeechRecognition.md) | Reactive SpeechRecognition | AUTO |
| [`useSpeechSynthesis`](./references/useSpeechSynthesis.md) | Reactive SpeechSynthesis | AUTO |
| [`useSwipe`](./references/useSwipe.md) | Reactive swipe detection based on `TouchEvents` | AUTO |
| [`useTextSelection`](./references/useTextSelection.md) | Reactively track user text selection based on `Window.getSelection` | AUTO |
| [`useUserMedia`](./references/useUserMedia.md) | Reactive `mediaDevices.getUserMedia` streaming | AUTO |

### Network

| Function | Description | Invocation |
|----------|-------------|------------|
| [`useEventSource`](./references/useEventSource.md) | An EventSource or Server-Sent-Events instance opens a persistent connection to an HTTP server | AUTO |
| [`useFetch`](./references/useFetch.md) | Reactive Fetch API provides the ability to abort requests | AUTO |
| [`useWebSocket`](./references/useWebSocket.md) | Reactive WebSocket client | AUTO |

### Animation

| Function | Description | Invocation |
|----------|-------------|------------|
| [`useAnimate`](./references/useAnimate.md) | Reactive Web Animations API | AUTO |
| [`useInterval`](./references/useInterval.md) | Reactive counter that increases on every interval | AUTO |
| [`useIntervalFn`](./references/useIntervalFn.md) | Wrapper for `setInterval` with controls | AUTO |
| [`useNow`](./references/useNow.md) | Reactive current Date instance | AUTO |
| [`useRafFn`](./references/useRafFn.md) | Call function on every `requestAnimationFrame` | AUTO |
| [`useTimeout`](./references/useTimeout.md) | Reactive value that becomes `true` after a given time | AUTO |
| [`useTimeoutFn`](./references/useTimeoutFn.md) | Wrapper for `setTimeout` with controls | AUTO |
| [`useTimestamp`](./references/useTimestamp.md) | Reactive current timestamp | AUTO |
| [`useTransition`](./references/useTransition.md) | Transition between values | AUTO |

### Component

| Function | Description | Invocation |
|----------|-------------|------------|
| [`computedInject`](./references/computedInject.md) | Combine `computed` and `inject` | AUTO |
| [`createReusableTemplate`](./references/createReusableTemplate.md) | Define and reuse template inside the component scope | AUTO |
| [`createTemplatePromise`](./references/createTemplatePromise.md) | Template as Promise | AUTO |
| [`templateRef`](./references/templateRef.md) | Shorthand for binding ref to template element | AUTO |
| [`tryOnBeforeMount`](./references/tryOnBeforeMount.md) | Safe `onBeforeMount` | AUTO |
| [`tryOnBeforeUnmount`](./references/tryOnBeforeUnmount.md) | Safe `onBeforeUnmount` | AUTO |
| [`tryOnMounted`](./references/tryOnMounted.md) | Safe `onMounted` | AUTO |
| [`tryOnScopeDispose`](./references/tryOnScopeDispose.md) | Safe `onScopeDispose` | AUTO |
| [`tryOnUnmounted`](./references/tryOnUnmounted.md) | Safe `onUnmounted` | AUTO |
| [`unrefElement`](./references/unrefElement.md) | Retrieves the underlying DOM element from a Vue ref or component instance | AUTO |
| [`useCurrentElement`](./references/useCurrentElement.md) | Get the DOM element of current component as a ref | AUTO |
| [`useMounted`](./references/useMounted.md) | Mounted state in ref | AUTO |
| [`useTemplateRefsList`](./references/useTemplateRefsList.md) | Shorthand for binding refs to template elements and components inside `v-for` | AUTO |
| [`useVirtualList`](./references/useVirtualList.md) | Create virtual lists with ease | AUTO |
| [`useVModel`](./references/useVModel.md) | Shorthand for v-model binding | AUTO |
| [`useVModels`](./references/useVModels.md) | Shorthand for props v-model binding | AUTO |

### Watch

| Function | Description | Invocation |
|----------|-------------|------------|
| [`until`](./references/until.md) | Promised one-time watch for changes | AUTO |
| [`watchArray`](./references/watchArray.md) | Watch for an array with additions and removals | AUTO |
| [`watchAtMost`](./references/watchAtMost.md) | `watch` with the number of times triggered | AUTO |
| [`watchDebounced`](./references/watchDebounced.md) | Debounced watch | AUTO |
| [`watchDeep`](./references/watchDeep.md) | Shorthand for watching value with `{deep: true}` | AUTO |
| [`watchIgnorable`](./references/watchIgnorable.md) | Ignorable watch | AUTO |
| [`watchImmediate`](./references/watchImmediate.md) | Shorthand for watching value with `{immediate: true}` | AUTO |
| [`watchOnce`](./references/watchOnce.md) | Shorthand for watching value with `{ once: true }` | AUTO |
| [`watchPausable`](./references/watchPausable.md) | Pausable watch | AUTO |
| [`watchThrottled`](./references/watchThrottled.md) | Throttled watch | AUTO |
| [`watchTriggerable`](./references/watchTriggerable.md) | Watch that can be triggered manually | AUTO |
| [`watchWithFilter`](./references/watchWithFilter.md) | `watch` with additional EventFilter control | AUTO |
| [`whenever`](./references/whenever.md) | Shorthand for watching value to be truthy | AUTO |

### Reactivity

| Function | Description | Invocation |
|----------|-------------|------------|
| [`computedAsync`](./references/computedAsync.md) | Computed for async functions | AUTO |
| [`computedEager`](./references/computedEager.md) | Eager computed without lazy evaluation | AUTO |
| [`computedWithControl`](./references/computedWithControl.md) | Explicitly define the dependencies of computed | AUTO |
| [`createRef`](./references/createRef.md) | Returns a `deepRef` or `shallowRef` depending on the `deep` param | AUTO |
| [`extendRef`](./references/extendRef.md) | Add extra attributes to Ref | AUTO |
| [`reactify`](./references/reactify.md) | Converts plain functions into reactive functions | AUTO |
| [`reactifyObject`](./references/reactifyObject.md) | Apply `reactify` to an object | AUTO |
| [`reactiveComputed`](./references/reactiveComputed.md) | Computed reactive object | AUTO |
| [`reactiveOmit`](./references/reactiveOmit.md) | Reactively omit fields from a reactive object | AUTO |
| [`reactivePick`](./references/reactivePick.md) | Reactively pick fields from a reactive object | AUTO |
| [`refAutoReset`](./references/refAutoReset.md) | A ref which will be reset to the default value after some time | AUTO |
| [`refDebounced`](./references/refDebounced.md) | Debounce execution of a ref value | AUTO |
| [`refDefault`](./references/refDefault.md) | Apply default value to a ref | AUTO |
| [`refManualReset`](./references/refManualReset.md) | Create a ref with manual reset functionality | AUTO |
| [`refThrottled`](./references/refThrottled.md) | Throttle changing of a ref value | AUTO |
| [`refWithControl`](./references/refWithControl.md) | Fine-grained controls over ref and its reactivity | AUTO |
| [`syncRef`](./references/syncRef.md) | Two-way refs synchronization | AUTO |
| [`syncRefs`](./references/syncRefs.md) | Keep target refs in sync with a source ref | AUTO |
| [`toReactive`](./references/toReactive.md) | Converts ref to reactive | AUTO |
| [`toRef`](./references/toRef.md) | Normalize value/ref/getter to `ref` or `computed` | EXPLICIT_ONLY |
| [`toRefs`](./references/toRefs.md) | Extended `toRefs` that also accepts refs of an object | AUTO |

### Array

| Function | Description | Invocation |
|----------|-------------|------------|
| [`useArrayDifference`](./references/useArrayDifference.md) | Reactive get array difference of two arrays | AUTO |
| [`useArrayEvery`](./references/useArrayEvery.md) | Reactive `Array.every` | AUTO |
| [`useArrayFilter`](./references/useArrayFilter.md) | Reactive `Array.filter` | AUTO |
| [`useArrayFind`](./references/useArrayFind.md) | Reactive `Array.find` | AUTO |
| [`useArrayFindIndex`](./references/useArrayFindIndex.md) | Reactive `Array.findIndex` | AUTO |
| [`useArrayFindLast`](./references/useArrayFindLast.md) | Reactive `Array.findLast` | AUTO |
| [`useArrayIncludes`](./references/useArrayIncludes.md) | Reactive `Array.includes` | AUTO |
| [`useArrayJoin`](./references/useArrayJoin.md) | Reactive `Array.join` | AUTO |
| [`useArrayMap`](./references/useArrayMap.md) | Reactive `Array.map` | AUTO |
| [`useArrayReduce`](./references/useArrayReduce.md) | Reactive `Array.reduce` | AUTO |
| [`useArraySome`](./references/useArraySome.md) | Reactive `Array.some` | AUTO |
| [`useArrayUnique`](./references/useArrayUnique.md) | Reactive unique array | AUTO |
| [`useSorted`](./references/useSorted.md) | Reactive sort array | AUTO |

### Time

| Function | Description | Invocation |
|----------|-------------|------------|
| [`useCountdown`](./references/useCountdown.md) | Reactive countdown timer in seconds | AUTO |
| [`useDateFormat`](./references/useDateFormat.md) | Get the formatted date according to the string of tokens passed in | AUTO |
| [`useTimeAgo`](./references/useTimeAgo.md) | Reactive time ago | AUTO |
| [`useTimeAgoIntl`](./references/useTimeAgoIntl.md) | Reactive time ago with i18n supported | AUTO |

### Utilities

| Function | Description | Invocation |
|----------|-------------|------------|
| [`createEventHook`](./references/createEventHook.md) | Utility for creating event hooks | AUTO |
| [`createUnrefFn`](./references/createUnrefFn.md) | Make a plain function accepting ref and raw values as arguments | AUTO |
| [`get`](./references/get.md) | Shorthand for accessing `ref.value` | EXPLICIT_ONLY |
| [`isDefined`](./references/isDefined.md) | Non-nullish checking type guard for Ref | AUTO |
| [`makeDestructurable`](./references/makeDestructurable.md) | Make isomorphic destructurable for object and array at the same time | AUTO |
| [`set`](./references/set.md) | Shorthand for `ref.value = x` | EXPLICIT_ONLY |
| [`useAsyncQueue`](./references/useAsyncQueue.md) | Executes each asynchronous task sequentially and passes the current task result to the next task | AUTO |
| [`useBase64`](./references/useBase64.md) | Reactive base64 transforming | AUTO |
| [`useCached`](./references/useCached.md) | Cache a ref with a custom comparator | AUTO |
| [`useCloned`](./references/useCloned.md) | Reactive clone of a ref | AUTO |
| [`useConfirmDialog`](./references/useConfirmDialog.md) | Creates event hooks to support modals and confirmation dialog chains | AUTO |
| [`useCounter`](./references/useCounter.md) | Basic counter with utility functions | AUTO |
| [`useCycleList`](./references/useCycleList.md) | Cycle through a list of items | AUTO |
| [`useDebounceFn`](./references/useDebounceFn.md) | Debounce execution of a function | AUTO |
| [`useEventBus`](./references/useEventBus.md) | A basic event bus | AUTO |
| [`useMemoize`](./references/useMemoize.md) | Cache results of functions depending on arguments and keep it reactive | AUTO |
| [`useOffsetPagination`](./references/useOffsetPagination.md) | Reactive offset pagination | AUTO |
| [`usePrevious`](./references/usePrevious.md) | Holds the previous value of a ref | AUTO |
| [`useStepper`](./references/useStepper.md) | Provides helpers for building a multi-step wizard interface | AUTO |
| [`useSupported`](./references/useSupported.md) | SSR compatibility `isSupported` | AUTO |
| [`useThrottleFn`](./references/useThrottleFn.md) | Throttle execution of a function | AUTO |
| [`useTimeoutPoll`](./references/useTimeoutPoll.md) | Use timeout to poll something | AUTO |
| [`useToggle`](./references/useToggle.md) | A boolean switcher with utility functions | AUTO |
| [`useToNumber`](./references/useToNumber.md) | Reactively convert a string ref to number | AUTO |
| [`useToString`](./references/useToString.md) | Reactively convert a ref to string | AUTO |

<!-- END GENERATED VUEUSE CATALOGUE -->

## Maintainer note

- Refresh the vendored catalogue with `node plugins/symprex-frontend/skills/vueuse-functions/scripts/update-vueuse-skill.mjs --ref <ref>`.
- If you omit `--ref`, the script fetches the latest `main` from `vueuse/vueuse`.
- Review `git diff -- plugins/symprex-frontend/skills/vueuse-functions` after updates.
- Run `git diff --check -- plugins/symprex-frontend/skills/vueuse-functions` before committing regenerated files.
- The generated section is sourced from `vueuse/vueuse`, filters out unsupported catalogue entries, and keeps only vendored local references that are still linked.

---
*Ported from the Signature365 `vueuse-functions` skill. Reference files may cite concrete Signature365 types and paths as worked examples; treat those as illustrations, and let the consuming repo's own rules and code win.*
