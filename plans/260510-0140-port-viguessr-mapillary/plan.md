---
title: "Port viguessr Mapillary strategy"
description: "Replace adaptive shrink/grow bbox loop with viguessr's proven approach: per-city fixed `delta` (half-bbox-side) + random-point dart-throw + simple retry-with-new-point. Fixes 'reduce data' 500s in HN/HCM dense areas."
status: pending
priority: P1
effort: 30m
created: 2026-05-10
source: https://github.com/luuvanduc1999/viguessr (assets/js/game.js, obfuscated)
blockedBy: []
blocks: []
---

# Port viguessr Mapillary strategy

## Why

Current `src/lib/mapillary.js` adaptive bbox sizing fails consistently in dense HN/HCM — Mapillary returns 500 'reduce data' when query bbox costs too much to scan. Adaptive grow on empty results worsens this.

viguessr (a sibling vngeoguessr project) ships a working implementation for the same cities. Their approach: **per-city fixed `delta`**, query a small bbox centered on a random point, retry only by re-rolling the random point (never resizing the bbox). The small fixed bbox keeps Mapillary query cost under their cap; the dart-throw eventually finds pano-rich windows.

## Source decoded (from obfuscated game.js)

```js
boundingBoxVN = {
  'HN':    [105.77, 20.96, 105.88, 21.05, delta=0.003],
  'TPHCM': [106.62, 10.71, 106.75, 10.83, delta=0.005],
  'HP':    [106.65, 20.80, 106.75, 20.90, delta=0.05],
  'ND':    [106.00, 20.35, 106.25, 20.50, delta=0.005],
  'DN':    [108.17, 16.00, 108.25, 16.10, delta=0.005],
};

async function getRandomMapillaryImage() {
  const lat = Math.random() * (maxLat - minLat) + minLat;
  const lng = Math.random() * (maxLong - minLong) + minLong;
  const bbox = [lng-delta, lat-delta, lng+delta, lat+delta].map(n => n.toFixed(4)).join(',');
  const url = `https://graph.mapillary.com/images?access_token=${TOKEN}&fields=id,thumb_original_url,geometry,is_pano&limit=3&bbox=${bbox}&is_pano=true`;
  const json = await (await fetch(url)).json();
  if (json.data?.length) {
    const panos = json.data.filter(d => d.is_pano);
    return panos.length ? panos[rand(panos.length)] : json.data[0];
  }
  return getRandomMapillaryImage(); // re-roll, same delta
}
```

## What changes locally

### `src/lib/game.js` (CITIES schema)

Add `mapillaryDelta` field to each enabled `CITIES` entry:

| Code | New `mapillaryDelta` | Source rationale |
|---|---|---|
| HN | `0.003` | viguessr value |
| TPHCM | `0.005` | viguessr value |
| DL | `0.005` | not in viguessr; use TPHCM-class default |
| DH | `0.005` | not in viguessr; use TPHCM-class default |
| DN | `0.005` (still disabled) | viguessr value, future-proof |

Export a `cityDeltas` map alongside existing `cityBboxes`/`cityNames`/`cityCenters`.

### `src/lib/mapillary.js` (rewrite)

Replace adaptive loop with viguessr-style: random point inside city bbox, fixed-size sub-bbox of side `2*delta`, re-roll position on empty/error.

Signature change: `fetchMapillaryImages(bbox, delta)`.

### `src/app/api/new-game/route.js`

- Import `cityDeltas` from `lib/game.js`.
- Pass `cityDeltas[cityCode]` to `fetchMapillaryImages`.
- Use `selectedImage.thumb_original_url` (revert from `thumb_2048_url`).

## Phases

| # | Phase | Effort | Status |
|---|---|---|---|
| 01 | [Per-city Delta + Random-Point Fetch](./phase-01-per-city-delta-random-point-fetch.md) | 30m | pending |

## Success Criteria

- HN, TPHCM, DL, DH all return panoramic image on first request (sample ≥ 3 attempts each).
- No `MAX_BBOX_AREA` / `MIN_BBOX_AREA` / shrink/grow logic remains in `src/lib/mapillary.js`.
- `npm run build` passes.

## Out of scope

- Token rotation or rate-limit handling
- Caching successful responses
- Adding more cities (DN remains disabled, future work)

## Manual cleanup after success

- Remove the diagnostic `console.error` of Mapillary URL/body once confirmed stable (or keep as observability).
