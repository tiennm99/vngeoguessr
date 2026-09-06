---
phase: 1
title: "Dynamic route"
status: completed
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Dynamic route

## Overview

Create `app/game/[region]/page.js` as a Server Component that resolves the
segment, validates it, and renders `GameClient` with a `region` prop. Convert
`GameClient` to take that prop instead of reading `useSearchParams`.

At the end of this phase `/game/TPHCM` works while `/game?region=TPHCM` still
works too — the old page is not removed until Phase 2.

## Requirements

**Functional**
- `/game/{CODE}` renders the game for that region.
- An unknown code returns 404.
- A real-but-unplayable code renders the existing coverage error panel.
- A non-canonical casing redirects to the canonical uppercase URL.
- All region pages prerender at build time.

**Non-functional**
- JavaScript only; individual function parameters.
- No gameplay behavior change — the round lifecycle, epoch guards and session
  handling in `GameClient` are untouched apart from where `region` comes from.
- The page must not import `pano-index.js` or `pano-db.js`. It is a Server
  Component, so nothing stops it — but the region tree (`regions.js`) is the
  only data it needs, and reaching further would put panorama coordinates a
  refactor away from the client. See the boundary comment at
  `src/lib/regions.js:1-11`.

## Architecture

```
app/game/[region]/page.js        NEW — Server Component
  ├─ generateStaticParams()      allRegions() -> [{region: 'VN'}, ...]
  ├─ params -> await, uppercase
  ├─ isRegion? no  -> notFound()
  ├─ canonical?   no  -> redirect(`/game/${CODE}`)
  └─ <GameClient region={CODE} />

app/game/page.js                 UNCHANGED this phase (Phase 2 reduces it)

components/GameClient.js         region arrives as a prop
  └─ useSearchParams removed
```

**`params` is a Promise in Next 16.** Verified in
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md:22-36`:
a Server Component page awaits it (`const { region } = await params`). Do not
destructure it synchronously — that is the Next 15-and-earlier shape this
project no longer runs.

**What `GameClient` loses.** Its init effect currently reads
`searchParams.get('region') || searchParams.get('location') || 'TPHCM'`
(`GameClient.js:171`) and depends on `searchParams`. With a prop, the region is
known at first render: the `location` state can initialise from it directly and
the effect's `searchParams` dependency disappears. Keep the `initialized` guard
— it still prevents a re-init.

**Why the page validates rather than `GameClient`.** `GameClient` treats an
unknown code by falling back to the label "Vietnam" (`GameClient.js:100-104`)
while the API resolves whatever it was given. Validating in the page turns a
typo'd URL into a 404, which is the honest answer, and lets that fallback branch
stay as the belt-and-braces it was meant to be.

## Related Code Files

- Create: `src/app/game/[region]/page.js`
- Modify: `src/app/components/GameClient.js`
- Read for reference: `src/lib/regions.js` (`allRegions`, `isRegion`, `getRegion`)
- Unchanged this phase: `src/app/game/page.js`

## Implementation Steps

1. **Create `src/app/game/[region]/page.js`** as a Server Component (no
   `"use client"`):
   - `export async function generateStaticParams()` returning
     `allRegions().map((code) => ({ region: code }))`. `allRegions()` returns
     **codes**, not nodes — `Object.keys(REGIONS)`, verified at
     `src/lib/regions.js:105-107`.
   - `export default async function GameRegionPage({ params })`, awaiting
     `params` to get the raw segment.
   - Uppercase it. If `!isRegion(code)`, call `notFound()` from `next/navigation`.
   - If the raw segment differs from the uppercased code, `redirect()` to
     `/game/${code}`.
   - Render `<GameClient region={code} />`.
   - No `Suspense` wrapper: the page no longer reads search params, so there is
     nothing to suspend on.

2. **Modify `GameClient.js`:**
   - Accept `region` as a parameter: `export default function GameClient(region)`
     — individual parameters, per the house rule, not `({ region })`.
   - Initialise `location` state from it: `useState(region)` instead of
     `useState('TPHCM')`.
   - Remove the `useSearchParams` import and call.
   - In the init effect, drop the `searchParams.get(...)` chain and the
     `searchParams` dependency; use `region` directly. Keep the `initialized`
     guard and the rest of the effect body as-is.
   - Leave `pickedCode`/`pickedRegion`/`regionName` alone — they still work,
     now against a code the page has already validated.

3. **Add a region-code character-class test** to `tests/regions.test.js`
   asserting every code matches `/^[A-Z0-9-]+$/`. This is what makes D3/D4 safe:
   a future code with a slash or a space would silently break the routing, and
   this test is where that gets caught.

4. Verify manually: `npm run dev`, then `/game/TPHCM`, `/game/VN`,
   `/game/HN-BADINH`, `/game/hn` (expect redirect to `/game/HN`),
   `/game/NOTAREGION` (expect 404), and `/game/DN-HOANGSA` or another real
   unplayable code (expect the coverage error panel, not a 404).

5. Run `npm test`, `npm run lint`, `npm run build`. Confirm the build output
   lists the region pages as prerendered.

## Todo

- [x] `src/app/game/[region]/page.js` created, Server Component, awaits `params`
- [x] `generateStaticParams` over `allRegions()`
- [x] `notFound()` for an unknown code
- [x] Canonical-casing redirect
- [x] `GameClient` takes `region` as a parameter; `useSearchParams` removed
- [x] Region-code character-class test in `tests/regions.test.js`
- [x] All six manual URL checks from step 4 pass
- [x] `npm test`, `npm run lint`, `npm run build` green

## Success Criteria

- [x] `/game/TPHCM` plays a TPHCM round; `/game/VN` plays a country round
- [x] `/game/NOTAREGION` → 404
- [x] `/game/DN-HOANGSA` → coverage error panel, not 404
- [x] `/game/hn` → redirect to `/game/HN`
- [x] `next build` output shows the region pages prerendered
- [x] No `useSearchParams` anywhere under `src/app/game/`
- [x] `/game?region=TPHCM` still works (old page untouched this phase)
- [x] Round behavior unchanged: epochs, prefetch, skip and result flow all
      behave as before

## Risk Assessment

**The casing redirect fires on the canonical URL and loops.** Signal: `/game/HN`
redirects to itself, browser reports too many redirects. Response: compare the
*raw segment* to the uppercased code and redirect only when they differ — never
redirect unconditionally. Verify `/game/HN` serves 200 directly, not 200-after-
redirect, in step 4.

**Assumption that may break:** that a Server Component page can pass a plain
string prop into the `"use client"` `GameClient` without ceremony. Strings cross
the boundary fine (unlike functions — the constraint that shaped the shelved
analytics plan), so this should be uneventful. Signal: a serialization error at
build. Response: if it somehow fails, keep the page as a thin client component
using `use(params)`, per the Client Component variant documented at
`dynamic-routes.md:52-76`.

**Prerendering 70 pages exposes a module-scope side effect.** `GameClient` is
client-only, but the page imports `regions.js`, which imports the generated
region tree and counts at module scope. Signal: build memory spikes or
prerender errors. Response: those modules are already imported by the home page
on every request, so this is well-trodden — but if it does misbehave, drop
`generateStaticParams` and render on demand.
