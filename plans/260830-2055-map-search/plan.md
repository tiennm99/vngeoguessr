---
title: "Map Search"
description: "Search box on the guess map: find districts, streets, and places to pan the map without revealing the answer."
status: completed
priority: P2
effort: "1d"
tags: [ui, guess-map, geocoding]
created: 2026-08-30
blockedBy: []
blocks: []
---

# Map Search

## Overview

Player feedback (translated): *"Please add search for district / street on the
map so it's easier to narrow the area — sometimes I know the place but I'm bad
with roads."*

Add a search box to the guess map. Typing shows two kinds of results:

1. **Region matches** — provinces and districts from the client-safe
   `REGIONS` tree (`src/lib/regions.js`). Instant, offline, diacritic- and
   alias-aware (`"quận 7"`, `"q7"`, `"District 7"` all hit `TPHCM-Q7`).
2. **Street / place matches** — the free Photon geocoder
   (`https://photon.komoot.io/api`, OSM data, no API key), debounced,
   restricted to the bbox of the region being played.

Selecting a result only pans/zooms the map (fitBounds on the result's extent,
or flyTo for a point). It never places the guess marker — the player still
clicks to guess, so scoring and the server-side answer flow are untouched.

**Geocoder choice.** Photon over Nominatim: the public Nominatim instance
forbids autocomplete (max 1 req/s, no search-as-you-type), while Photon is
built for it. Same underlying OSM data. If Photon is down, region search still
works locally and the dropdown shows an "online search unavailable" row.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Search districts/provinces with Vietnamese diacritics and common aliases, fully offline | P1 |
| 2 | Search streets and places via Photon, limited to the played region's bbox | P1 |
| 3 | Selecting a result pans/zooms only — never sets or moves the guess | P1 |
| 4 | Search degrades gracefully when the geocoder is unreachable | P2 |

## Non-Goals

- No guess placement from search results.
- No server-side proxy or caching of geocoder calls (public API, no key).
- No search on the result map or debug maps.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Geo-search library](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Search UI](./phase-02-search-ui.md) | Completed |

## Success Criteria

- [x] Typing `hoàn kiếm`, `hoan kiem`, or `quận 7` lists the matching district instantly
- [x] Typing a street name (e.g. `Nguyễn Huệ`) lists Photon results inside the played region only
- [x] Choosing a result moves the map; the guess marker is unchanged
- [x] With network blocked, district search still works and no error is thrown
- [x] `npm test` passes; `src/lib/geo-search.js` stays client-safe (no pano-index import)

Criteria 1-2 and 4-5 are test-verified; criterion 3 is code-review-verified,
with the manual browser pass handed to the maintainer per repo convention.

## Open Questions

None.

<!-- slug: map-search -->
