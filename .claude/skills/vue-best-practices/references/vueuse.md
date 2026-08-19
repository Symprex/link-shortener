---
title: VueUse
impact: MEDIUM
impactDescription: Routes agents to the vueuse-functions skill rather than restating its boundaries here
type: best-practice
tags: [vue3, vueuse, composables, reactivity, browser-apis]
---

# VueUse

**Impact: MEDIUM** - This file is a pointer, deliberately. Load the `vueuse-functions` skill for both the function-selection catalogue and the architectural boundaries — it is the single authoritative place for both.

The one rule worth repeating here: reach for VueUse for browser primitives and small reactive helpers, not as a substitute for loaders, page models, slices or the repo's generated API helpers.
