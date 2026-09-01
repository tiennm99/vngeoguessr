---
phase: 2
title: "Attribution, docs, and verification"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Attribution, docs, and verification

## Overview

Make the user-facing licensing surfaces (`/credits`, docs) reflect the new
provider, then run the full verification lane with no key set to prove the
fallback path is regression-free.

## Requirements

- Functional: `/credits` names Geoapify as tile provider when configured; docs
  describe both modes and the env var
- Non-functional: no new services required to build, test, or run locally

## Architecture

The credits page is a static server component, so it cannot know at request
time whether the deployment set the key — but `NEXT_PUBLIC_*` is inlined at
build time, so a simple conditional on `process.env.NEXT_PUBLIC_GEOAPIFY_KEY`
(truthiness only — never render the value) is evaluated during prerender and
correctly reflects the deployed configuration.

## Related Code Files

- Modify: `src/app/credits/page.js` — "Map data & tiles" card: tiles line reads
  "served by Geoapify" (link) when the key is baked in, "served by
  OpenStreetMap" otherwise; ODbL data credit stays unconditional
- Modify: `docs/tech-stack.md` — "Street View & Mapping" section: replace the
  bare OpenStreetMap-tiles line with the two-mode setup and the env var
- Modify: `docs/features.md` — "Interactive Maps" first bullet mentions the
  provider switch
- Modify: `docs/development.md` — env var table/section if one exists; add
  `NEXT_PUBLIC_GEOAPIFY_KEY` (optional, tile provider)

## Implementation Steps

1. Update the credits page conditional and docs per above.
2. `npm run lint` — zero errors.
3. `npm run build` — passes; `/credits` still prerenders static.
4. `npm run test:e2e` — passes with no key set (e2e stubs API calls; tile
   requests keep hitting the OSM fallback URL exactly as today).
5. Report to the user: which env var to set in Vercel, that the key must be
   domain-restricted in the Geoapify dashboard (it is public by design), and
   that the swap becomes mandatory before ads ship.

## Success Criteria

- [x] `/credits` provider line matches the built configuration in both modes
- [x] `docs/tech-stack.md`, `docs/features.md`, `docs/development.md` accurate
- [x] `npm run lint` 0 errors, `npm run build` passes, `npm run test:e2e` green with no key

## Risk Assessment

- **Key leaks into rendered HTML**: the conditional must test truthiness only;
  signal = key string in `.next` output or page source; response = grep the
  build output for the key value before deploy (`grep -r "$KEY" .next/`) —
  note `NEXT_PUBLIC_*` is intentionally public, so this is hygiene (keep it
  out of prose/docs), not secrecy.
- **e2e flakiness from live tile fetches**: e2e already tolerates today's OSM
  fetches, and no-key mode changes nothing; if tiles ever get stubbed later,
  stub both URL patterns.
