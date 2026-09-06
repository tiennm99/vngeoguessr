---
phase: 1
title: "Analytics foundation"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Analytics foundation

## Overview

Create the single module that owns every event name, property shape and privacy
rule, plus the client wrapper that lets `beforeSend` reach `<Analytics />`. No
call sites are instrumented in this phase — this is the surface phases 2-4
import.

## Requirements

**Functional**
- One exported function per event in the plan's vocabulary table.
- A `beforeSend` filter that drops `/debug/*` pageviews and strips query
  strings from every tracked URL.
- A `"use client"` wrapper component so the filter can be passed as a prop.

**Non-functional**
- Plain JavaScript, individual function parameters (no object destructuring in
  signatures), matching the house style in `src/lib/game.js`.
- No new dependencies. `@vercel/analytics@1.6.1` is already installed.
- Every emit is `try/catch`-guarded: analytics can never throw into the game.
- Testable in the existing `environment: 'node'` vitest setup, which means the
  module must not touch `window` at import time.

## Architecture

```
src/lib/analytics.js          pure, tested, node-safe
  ├─ EVENTS                   frozen name map (the vocabulary)
  ├─ regionLevel(code)        getRegion(code).level, guarded -> country|province|district|unknown
  ├─ distanceBand(meters)     SCORE_BANDS -> '0-50m' | ... | '1km+'
  ├─ shouldSendEvent(event)   the beforeSend predicate, pure
  ├─ emit(name, properties)   internal: allowlist + try/catch + track()
  └─ trackRoundStarted(...)   one exported wrapper per event
                              (and the other 11)

src/app/components/AnalyticsProvider.js   "use client"
  └─ <Analytics beforeSend={...} />       wires shouldSendEvent to the SDK

src/app/layout.js
  └─ imports AnalyticsProvider instead of Analytics
```

**Why `emit` builds payloads from an allowlist.** A helper that accepts a
result object and spreads it is one careless call away from shipping
`exactLocation` to Vercel. Each exported wrapper names its properties
explicitly and passes scalars, so a coordinate has no path into a payload.

**Node-safety.** `track()` from `@vercel/analytics` is a no-op outside the
browser but still imports browser-shaped code. Import it at module top level
(the package handles SSR), and keep `emit` guarded so a test-environment call
is silently inert rather than a throw.

## Related Code Files

- Create: `src/lib/analytics.js`
- Create: `src/app/components/AnalyticsProvider.js`
- Create: `tests/analytics.test.js`
- Modify: `src/app/layout.js` (swap the `Analytics` import for the wrapper)

## Implementation Steps

1. **Write `src/lib/analytics.js`.**
   - `EVENTS`: a deep-frozen name map, one entry per vocabulary row. Freeze it
     for the same reason `SCORE_BANDS` is frozen — this object is read from
     many call sites and one mutation would rewrite the vocabulary process-wide.
   - `regionLevel(code)`: return the region node's own `level` field via
     `getRegion(code).level` — it already holds exactly
     `'country' | 'province' | 'district'`, so do not recompute it from
     `ancestorsOf`. Guard with `isRegion(code)` and return `'unknown'` for a
     code that is not a region rather than throwing (`getRegion` throws on an
     unknown code): an unknown `?region=` must not break a round.
   - `distanceBand(meters)`: derive labels from `SCORE_BANDS` (do not re-type
     the thresholds), formatting with `formatDistance` so `1000` reads `1km`,
     matching the home page's trimmed labels. Above the last band, `'1km+'`.
   - `shouldSendEvent(event)`: parse `event.url`, return `null` when the
     pathname is `/debug` or starts with `/debug/`, otherwise return the event
     with `search` cleared. Match on the parsed pathname, never a substring:
     a naive `includes('/debug')` would also drop a hypothetical `/debugger`.
   - `emit(name, properties)`: `try { track(name, properties) } catch {}`.
   - One exported wrapper per event, each naming its properties explicitly.

2. **Write `src/app/components/AnalyticsProvider.js`** — a `"use client"`
   component rendering `<Analytics beforeSend={shouldSendEvent} />`. Keep it
   props-free; it exists solely to cross the server/client boundary.

3. **Modify `src/app/layout.js`** — replace the `@vercel/analytics/next` import
   and `<Analytics />` with `AnalyticsProvider`. Leave `<SpeedInsights />`
   untouched; it takes no function props and needs no wrapper.

4. **Write `tests/analytics.test.js`** covering:
   - `distanceBand` at every boundary: 0, 50, 51, 100, 200, 500, 1000, 1001,
     99999. Boundaries are inclusive upper bounds, same as `calculateScore`.
   - `regionLevel` for `VN`, a province, a district, and an unknown code.
   - `shouldSendEvent`: `/debug` and `/debug/coverage` return `null`;
     `/debugger`, `/game`, `/` and `/credits` survive; `/game?region=TPHCM`
     survives with the query stripped.
   - Payload allowlist: call each exported wrapper with a spy on `track` and
     assert the exact property keys — no extra key, and specifically no
     `lat`, `lng`, `exactLocation`, `panoId`, `url`, `username` or `sessionId`.

5. Run `npm test` and `npm run lint`.

## Todo

- [ ] `src/lib/analytics.js` with EVENTS, regionLevel, distanceBand, shouldSendEvent, emit
- [ ] Twelve exported event wrappers
- [ ] `src/app/components/AnalyticsProvider.js`
- [ ] `src/app/layout.js` swapped to the wrapper
- [ ] `tests/analytics.test.js`
- [ ] `npm test` green, `npm run lint` 0 errors

## Success Criteria

- [ ] `npm test` passes including the new suite
- [ ] `npm run build` clean — in particular no "Functions cannot be passed
      directly to Client Components" error from `layout.js`
- [ ] `distanceBand` thresholds are derived from `SCORE_BANDS`, not re-typed
      (grep the file: no literal `50`, `100`, `200`, `500`, `1000`)
- [ ] A test proves a coordinate cannot reach a payload
- [ ] No call site is instrumented yet; game behavior is byte-identical

## Risk Assessment

**`track()` import breaks the node test environment.** Signal: `tests/analytics.test.js`
fails at import with a `window`/`document` reference error. Response: mock
`@vercel/analytics` with `vi.mock` in the test file — the tests assert payload
shape, not delivery, so the mock is the right seam regardless.

**The wrapper changes hydration or script injection timing.** Signal: the
Analytics script stops loading, or a hydration warning appears in dev. Response:
the wrapper is a pass-through with no state; if it misbehaves, render
`<Analytics />` bare and move the `/debug` exclusion to a Vercel project-level
setting instead, accepting the query strings.

**Assumption that may break:** that `beforeSend` receives a fully-qualified URL.
The type says `url: string` without specifying absolute or relative. Signal: the
`URL` constructor throws in the filter. Response: parse with a base
(`new URL(event.url, 'http://x')`), which works for both forms — write it that
way from the start.
