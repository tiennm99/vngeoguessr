---
phase: 1
title: "Geo-search library"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Geo-search library

## Overview

A client-safe search module: instant region matching over the `REGIONS` tree
plus a thin Photon fetch wrapper, with tests. No UI in this phase.

## Requirements

- Functional: match provinces/districts by name with Vietnamese diacritics
  folded and common aliases; fetch street/place results from Photon restricted
  to a bbox; normalize both result shapes into one record.
- Non-functional: client-safe (never import `pano-index.js` or
  `src/data/panos/`); individual function parameters, no TypeScript; no new
  npm dependency.

## Architecture

New file `src/lib/geo-search.js`:

- `foldDiacritics(text)` — lowercase, NFD strip combining marks, map `đ → d`.
  `"Bình Thạnh"` → `"binh thanh"`.
- `regionSearchKeys(region)` — folded name plus aliases: for `District N`
  names also `quan n`, `q n`, `qn`; always add the space-stripped form
  (`hoankiem`). Keys are computed once at module load into a flat array of
  `{ code, key }` entries covering every non-country node.
- `searchRegions(query, rootCode)` — fold the query, return regions under
  `rootCode` (use `leavesUnder`/`provinceOf` relationships from `regions.js`,
  or simple prefix check on `code`) whose keys contain the folded query as a
  substring, provinces before districts, capped at 5. Empty/1-char query
  returns `[]`.
- `searchPhoton(query, bbox, limit, signal)` — GET
  `https://photon.komoot.io/api?q=<query>&limit=<limit>&bbox=<w,s,e,n>`,
  pass `signal` through to `fetch` for cancellation. Parse GeoJSON features
  into normalized results; on non-OK response or thrown fetch error, return
  `null` (the UI renders the unavailable row on `null`, empty list on `[]`).
- Normalized result: `{ kind: 'region'|'place', label, sublabel, center: [lat, lng], bbox: [w,s,e,n] | null }`.
  For Photon: `label` from `properties.name`, `sublabel` from
  street/district/city/state fields, `bbox` from `properties.extent`
  (Photon extent order is `[w,n,e,s]` — reorder to the repo's `[w,s,e,n]`),
  `center` from geometry coordinates `[lng,lat]` flipped to `[lat,lng]`.

## Related Code Files

- Create: `src/lib/geo-search.js`
- Create: `tests/geo-search.test.js`
- Modify: `tests/regions.test.js` — add `geo-search.js` to the client-safety
  guard if the guard enumerates modules (check how the existing guard works
  and follow its pattern)

## Implementation Steps

1. Read `tests/regions.test.js` to mirror the server-only-import guard pattern.
2. Implement `src/lib/geo-search.js` per the architecture above.
3. Tests (run against the fake, `npm test`):
   - folding: `"Bình Thạnh"` → `"binh thanh"`, `"Đống Đa"` → `"dong da"`
   - `searchRegions('quan 7', 'TPHCM')` and `('q7', 'TPHCM')` → `TPHCM-Q7`;
     `('hoàn kiếm', 'VN')` → `HN-HOANKIEM`; `('xyz', 'VN')` → `[]`
   - root scoping: `searchRegions('district 1', 'HN')` → `[]`
   - `searchPhoton` with mocked `fetch`: parses features, reorders extent,
     returns `null` on 503 and on network throw
   - guard: importing `geo-search.js` never pulls in `pano-index.js`

## Success Criteria

- [x] All new tests pass via `npm test`
- [x] `searchRegions` handles diacritics, aliases, and root scoping
- [x] `searchPhoton` returns normalized results and `null` on failure
- [x] Module is client-safe under the existing guard

## Risk Assessment

- **Photon response shape drift** — normalization is isolated in one parser
  function with tests on a captured fixture; if live shape differs during
  phase 2 manual testing, fix the parser, not the UI.
- **Alias coverage too thin** (players type forms we didn't map, e.g.
  `"huyện Củ Chi"`) — folding plus substring match already absorbs the
  `huyện/quận` prefix case since the district word is contained; if manual
  testing still misses common inputs, extend `regionSearchKeys`, don't
  special-case the UI.
