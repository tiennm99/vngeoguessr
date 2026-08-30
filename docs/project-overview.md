# Project Overview

VNGeoGuessr is a GeoGuessr clone focused on Vietnamese locations. Players pick a
place on a three-level region tree, view a real street panorama, and guess where
it was taken. Built with Next.js 15.5, React 19 and Tailwind CSS 4.

## Key Characteristics

- **Nested regions**: one country, five provinces, 61 districts and towns. The
  tree is generated into `src/data/regions/` — see `src/lib/regions.js` for the
  client-safe traversal API.
- **Rollup scoring**: a guess is credited to the district its panorama actually
  sits in, then rolled upward to that district's province and to Vietnam. One
  round writes to three score boards and three distance boards.
- **Prebuilt panorama indexes**: each province ships a list of known Mapillary
  panorama ids with the district each one falls in, built offline. The game
  picks from that list instead of searching Mapillary at request time.
- **Anti-cheat security**: sessions live in Redis; the exact coordinates and the
  resolved district are server-side secrets until the guess is submitted.
- **Interactive gameplay**: click-to-guess on a Leaflet map.

## Game Mechanics

- **Street View**: Mapillary panoramas, resolved by image id from the prebuilt index
- **360° Viewer**: PhotoSphere Viewer for panoramic images
- **Interactive Maps**: Leaflet + OpenStreetMap for guess placement
- **Distance-based Scoring**: 0-5 point scale based on accuracy (Turf.js)
- **Session Isolation**: Redis-stored sessions with 30-minute expiry

## Administrative basis

Every boundary is a **pre-2025-merger** administrative extent, taken from
OpenStreetMap `boundary`/`historic` relations. Vietnam merged its provinces in
mid-2025; today's official Ho Chi Minh City covers 36,566 km² and reaches Vung
Tau, which is not what people mean by the city. Two consequences to remember:

- **Da Lat** is a district of **Lam Dong**, not a top-level city.
- **Duc Hoa** belongs to **Long An**, not the Tay Ninh it was merged into.

## Coverage

Five provinces — Ha Noi, Ho Chi Minh, Da Nang, Lam Dong, Long An — split into 61
districts and towns. Coverage is deliberately partial and will grow in future
releases. **None are planned at present.**

Absent coverage has three distinct causes. Only one is a defect:

**Not yet added** — any province outside the five. Roadmap, not a bug. Adding one
is an entry in the `REGIONS` config of `scripts/build-region-boundaries.mjs`, a
boundary build, a panorama index build, and a district assignment run. No
application code changes: every UI surface reads the generated tree.

**No street imagery** — a district inside a covered province where Mapillary
holds no panoramas, or too few to play, typically rural. The tree lists it;
`isPlayable()` in `src/lib/regions.js` is what keeps it out of play --
`resolvePlayableRegion()` rejects it server-side before a session is created,
and `RegionPicker` renders it disabled. Expected, and it may resolve on its own: re-running the
panorama index build picks up new Mapillary coverage. A district that is playable
but sparse is flagged `thin` and labelled "few streets".

**Missing from the boundary** — a district whose OpenStreetMap lookup did not
resolve, so it never entered the province union and its panoramas were clipped
away. **Cu Chi** in Ho Chi Minh City is the known case: `"missingParts": 1` in
`src/data/boundaries/tphcm/tphcm.json`, and `TPHCM-CUCHI` carries no `bbox` in
the tree. Fixable: resolve the query, rebuild the boundary, re-run that
province's panorama index. It costs Mapillary tile requests against a
50,000/day cap, which is why it is not done automatically.

Before treating an empty district as a bug, check `missingParts` in its
province's boundary file — that is what distinguishes the third case from the
first two.
