---
phase: 1
title: "Shared tile config and provider swap"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Shared tile config and provider swap

## Overview

Create one client-safe module that decides the tile URL, attribution, and
Leaflet layer options, then make all three maps consume it. Geoapify when
`NEXT_PUBLIC_GEOAPIFY_KEY` is set, OSM fallback when it is not.

## Requirements

- Functional: identical map behavior in both provider modes; no visual
  regression at any zoom the game uses (world → district)
- Non-functional: `src/lib/map-tiles.js` must stay client-safe — it may not
  import `pano-index.js`, `pano-db.js`, or anything server-only
  (`tests/regions.test.js` walks the import graph and will fail otherwise)

## Architecture

`NEXT_PUBLIC_*` vars are inlined at build time, so a plain module constant is
enough — no runtime config, no context, no hook.

```js
// src/lib/map-tiles.js — the only place a tile URL may live
const geoapifyKey = process.env.NEXT_PUBLIC_GEOAPIFY_KEY;

export function getTileConfig() {
  if (geoapifyKey) {
    return {
      url: `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${geoapifyKey}`,
      options: {
        maxZoom: 19,
        attribution:
          'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> | © OpenStreetMap contributors',
      },
    };
  }
  // No key: the OSM public server. Fine for local dev, e2e, and forks;
  // production must set the key once ads ship (usage policy bans commercial).
  return {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: '© OpenStreetMap contributors' },
  };
}
```

Callers replace their hardcoded `L.tileLayer(...)` with:

```js
const tiles = getTileConfig();
L.tileLayer(tiles.url, tiles.options).addTo(map);
```

`osm-bright` is the Geoapify style closest to the current OSM look, so guess
difficulty and label density stay comparable.

## Related Code Files

- Create: `src/lib/map-tiles.js`
- Modify: `src/app/components/LeafletMap.js` (tile layer at ~line 68)
- Modify: `src/app/components/ResultMap.js` (tile layer at ~line 36)
- Modify: `src/app/debug/coverage/CoverageMap.js` (tile layer at ~line 46)
- Modify: `.env` — add `NEXT_PUBLIC_GEOAPIFY_KEY=` placeholder comment only
  (never commit a real key; `.env` is gitignored — flag the change to the user
  for manual processing per repo rules)

## Implementation Steps

1. Write `src/lib/map-tiles.js` as above (individual parameters, JS only, per
   repo conventions).
2. Swap the three `L.tileLayer` calls to consume `getTileConfig()`.
3. Verify the import-graph guard: run `npm test` (regions test walks client
   imports).
4. Smoke-check both modes locally: `npm run dev` without a key (OSM), then
   with a throwaway key (Geoapify tiles render, attribution shows Geoapify).

## Success Criteria

- [x] `grep -r "tile.openstreetmap.org" src/` matches only `src/lib/map-tiles.js`
- [x] All three maps render in both key/no-key modes
- [x] `npm test` passes (client-safety import walk included)

## Risk Assessment

- **Geoapify credit budget** (1 credit may cover fewer tiles than expected):
  signal = 4xx/429 tile responses or blank tiles in production once the key is
  live; response = check the Geoapify dashboard usage graph, and if the free
  budget is genuinely short, fall back to OSM (donation-only phase is
  tolerated) and revisit OpenFreeMap+MapLibre per the research report.
- **Style mismatch** (osm-bright labels differ from OSM defaults enough to
  annoy players): signal = user feedback after deploy; response = try
  Geoapify's `osm-carto` style, which mimics OSM's default cartography.
