---
phase: 1
title: "Per-city Delta + Random-Point Fetch"
status: pending
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Per-city Delta + Random-Point Fetch

## Overview

Replace the adaptive bbox loop in `src/lib/mapillary.js` with viguessr's random-point dart-throw using a per-city fixed `delta`. Add `mapillaryDelta` to each `CITIES` entry. Update `new-game` route to pass delta and use `thumb_original_url`.

## Related Code Files

- Modify: `src/lib/game.js` — add `mapillaryDelta` field on each `CITIES` entry; export `cityDeltas`
- Rewrite: `src/lib/mapillary.js` — random-point + fixed-delta + retry-position
- Modify: `src/app/api/new-game/route.js` — import `cityDeltas`, pass to fetch, switch back to `thumb_original_url`

## Implementation Steps

### 1. `src/lib/game.js`

Inside each `CITIES.<code>` object, add a numeric field `mapillaryDelta`:

```js
HN:    { ..., mapillaryDelta: 0.003 },
TPHCM: { ..., mapillaryDelta: 0.005 },
DL:    { ..., mapillaryDelta: 0.005 },
DH:    { ..., mapillaryDelta: 0.005 },
DN:    { ..., mapillaryDelta: 0.005 },  // disabled but populated
```

Below the existing `cityBboxes` export, add:

```js
export const cityDeltas = Object.fromEntries(
  Object.values(CITIES).map(city => [city.code, city.mapillaryDelta])
);
```

### 2. `src/lib/mapillary.js` (full rewrite)

```js
// Mapillary API utilities
//
// Strategy ported from viguessr (https://github.com/luuvanduc1999/viguessr):
// pick a random point inside the city bbox, query a small fixed-size sub-bbox
// (side = 2*delta) centered on that point, and re-roll the point on empty
// results or transient 5xx. The fixed small size keeps Mapillary query cost
// below their cap; the dart-throw eventually lands on a pano-rich window.

const MAX_RETRIES = 10;

export async function fetchMapillaryImages(bbox, delta) {
  const accessToken = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MAPILLARY_ACCESS_TOKEN environment variable is not set');
  }

  const [minLng, minLat, maxLng, maxLat] = bbox;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const lat = Math.random() * (maxLat - minLat) + minLat;
    const lng = Math.random() * (maxLng - minLng) + minLng;
    const queryBbox = [
      (lng - delta).toFixed(4),
      (lat - delta).toFixed(4),
      (lng + delta).toFixed(4),
      (lat + delta).toFixed(4),
    ].join(',');
    const apiUrl = `https://graph.mapillary.com/images?access_token=${accessToken}&fields=id,thumb_original_url,geometry,is_pano&limit=3&bbox=${queryBbox}&is_pano=true`;

    try {
      const response = await fetch(apiUrl, {
        headers: { Accept: 'application/json' },
        next: { revalidate: 0 },
      });

      if (response.status === 401) {
        throw new Error('Mapillary authentication failed');
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '<unreadable>');
        lastError = `${response.status}: ${body.slice(0, 200)}`;
        console.error(`Attempt ${attempt}/${MAX_RETRIES}: Mapillary ${response.status}; re-rolling`);
        continue;
      }

      const data = await response.json();
      const images = data.data || [];
      const panos = images.filter(img => img.is_pano);

      if (panos.length > 0) {
        console.log(`Found ${panos.length} panos on attempt ${attempt}`);
        return { success: true, data: panos };
      }

      console.log(`Attempt ${attempt}/${MAX_RETRIES}: no panos; re-rolling`);
    } catch (error) {
      if (error.message === 'Mapillary authentication failed') {
        throw error;
      }
      lastError = error.message;
      console.error(`Attempt ${attempt}/${MAX_RETRIES} threw: ${error.message}; re-rolling`);
    }
  }

  return {
    success: false,
    error: lastError
      ? `No panos after ${MAX_RETRIES} attempts (last: ${lastError})`
      : 'No panos found',
  };
}
```

Removed:
- `MAX_BBOX_AREA` / `MIN_BBOX_AREA` / `GROW_FACTOR` / `SHRINK_FACTOR`
- `getRandomSubBbox` helper (replaced inline)
- Adaptive shrink/grow loop

### 3. `src/app/api/new-game/route.js`

Update imports + call:

```js
// Before:
import { cityNames, cityBboxes } from '../../../lib/game.js';
const bbox = cityBboxes[cityCode];
const imageResult = await fetchMapillaryImages(bbox);
const imageUrl = selectedImage.thumb_2048_url;

// After:
import { cityNames, cityBboxes, cityDeltas } from '../../../lib/game.js';
const bbox = cityBboxes[cityCode];
const delta = cityDeltas[cityCode];
const imageResult = await fetchMapillaryImages(bbox, delta);
const imageUrl = selectedImage.thumb_original_url;
```

Add a guard for missing delta:

```js
if (!delta) {
  return NextResponse.json({
    success: false,
    error: `No Mapillary delta configured for city: ${cityCode}`,
  }, { status: 400 });
}
```

## Success Criteria

- [ ] `npm run build` passes
- [ ] HN: 3 sample requests → ≥2 success
- [ ] TPHCM: 3 sample requests → ≥2 success
- [ ] DL: 3 sample requests → ≥2 success
- [ ] DH: 3 sample requests → ≥2 success
- [ ] No 'reduce data' 500s in production logs after deploy
- [ ] `grep "MAX_BBOX_AREA\|GROW_FACTOR\|SHRINK_FACTOR" src/` empty

## Risk Assessment

- **Risk**: viguessr's HN delta=0.003 (666m) might still occasionally hit 'reduce data' if Mapillary tightens further. **Mitigation**: 10 retries; if persistent, drop HN delta to 0.002.
- **Risk**: Per-city delta requires a value for each enabled city; missing entry crashes. **Mitigation**: explicit guard in route; default fallback to 0.005 if undefined.
- **Risk**: `thumb_original_url` may be deprecated. **Mitigation**: viguessr is shipping it in production today; if Mapillary deprecates, swap to `thumb_2048_url`.
- **Risk**: Rare cities with sparse pano coverage (DH 666m windows) might exhaust retries. **Mitigation**: keep delta=0.005 (1.1km) for non-HN cities.

## Rollback

Single commit; revert HEAD to restore current adaptive code. Mapillary deploys with no schema/state changes, so rollback is instant.
