---
phase: 2
title: "Panorama district partition"
status: completed
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Panorama district partition

## Outcome (recorded after execution)

| Province | Panos | Cells | Districts | Stranded | Worst |
|---|---|---|---|---|---|
| HN | 225,966 | 1,281 | 30/30 | 30 (0.01%) | 35 m |
| TPHCM | 184,938 | 787 | 21/22 | 184 (0.10%) | 46 m |
| DN | 1,521 | 39 | 5/7 | 1 (0.07%) | 6 m |
| LA | 11,717 | 106 | 1/1 | 0 | - |
| LD | 475 | 8 | 1/1 | 0 | - |

**64 of 67 regions playable.** The three that are not are one of each cause in
the coverage note: `TPHCM-CUCHI` has no boundary, `DN-CAMLE` and `DN-HOAVANG`
have no street imagery (verified: zero panoramas even inside Cam Le's bbox).

Data growth 2.85 MB against the 3.5 MB budget. Zero Mapillary requests.

Nine findings from the code review were fixed before landing. Three mattered:

1. **A partial run silently zeroed `counts.js`** for every province it did not
   process, and the suite still passed because the playability tests iterate
   whatever `playableRegions()` reports. Partial runs now leave `counts.js`
   alone.
2. **`build-pano-index.mjs` never received the shared assignment module**, so
   any province rebuild would emit an index with no districts -- leaf draws
   throwing, province draws silently crediting the province forever. Folded in.
3. **The nearest-district fallback ranked by bbox centre**, measured at 6.09 km
   of misattribution in Ho Chi Minh City. Ranking by real distance to the
   outline brings the worst case to 46 m.

Two test-integrity fixes worth recording: the client-safety import walk matched
only single-quoted relative paths and was blind to the `@/` alias the repo uses
in 15+ files -- it was passing by luck of import style, not by enforcement. And
`unassigned` was structurally always zero, so the plan's "under 2%" gate
measured nothing; a real `stranded` counter replaced it (actual 0.05%, with a
build-time throw above 2%).

`npm test` 182/182, `build:check` and `lint` clean.

## Overview

Assign every panorama already on disk to the district it sits in, re-clip against
the rebuilt province outlines, and teach `src/lib/pano-index.js` to draw from any
node in the tree. No new Mapillary requests.

## Requirements

**Functional**
- Every panorama in the five province indexes carries a district assignment, or
  is counted in a reported unassigned tally.
- Panoramas now outside their rebuilt province outline are dropped, and the
  header `bbox`/`count` rewritten (H7).
- `pickRandomPano(code)` accepts a leaf, a province, or `VN`, and reports the
  resolving leaf.
- `fetchCityPanorama` propagates that leaf from the **winning** attempt (C2).
- Drawing at `VN` picks a province uniformly first, then a panorama within it.
- Drawing at a province stays uniform over its panoramas (today's behaviour).
- Per-node counts and playability are emitted as `src/data/regions/counts.js`.

**Non-functional**
- Zero Mapillary tile requests. The daily cap is 50,000 and a full province
  rebuild costs ~2,800.
- Server-side only. `src/lib/regions.js` must stay free of these imports.
- Bucket construction is lazy and memoised per province — a Da Lat request must
  not point-in-polygon 226k Ha Noi entries.

## Architecture

### The partition script

`scripts/assign-pano-districts.mjs` — network-free, built on a shared module:

```
for each province in [HN, DN, TPHCM, LD, LA]:
  load src/data/panos/<province>.json
  re-clip against the rebuilt province outline; drop strays; rewrite bbox/count
  load each child leaf boundary + precompute its bbox
  for each pano:
    candidates = leaves whose bbox contains the point     # cheap reject
    d = first candidate where booleanPointInPolygon       # early exit
  rewrite the file with districts[] / districtCounts / districtCells / unassigned
write src/data/regions/counts.js
```

**Cost.** 226k Ha Noi points × 30 leaves is 6.8 M bbox tests (trivial) plus ~1-2
`booleanPointInPolygon` calls per point after the reject. Single-digit minutes,
which is why the bbox prefilter is not optional.

**M1 — the shared module.** Phase 2 previously promised a "shared assignment
function" with nowhere to put it. Create `scripts/lib/assign-districts.mjs` and
import it from both `assign-pano-districts.mjs` and `build-pano-index.mjs`, so
the fallback rules cannot drift between two copies.

**M1 — the stale default list.** `build-pano-index.mjs` ends with
`const codes = requested.length ? requested : ['HN','TPHCM','DN','DL','DH'];`
and `writeBarrel()` scans the directory rather than a declared list. After Phase
1's rename, an argument-less run rebuilds `DL`/`DH`, writes `dl.json`/`dh.json`
*beside* `ld.json`/`la.json`, and the barrel silently gains duplicate provinces —
`countPanos('VN')` then double-counts ~12k panoramas. Update the default to
`['HN','TPHCM','DN','LD','LA']` and make `writeBarrel` reject a filename that is
not a known province code.

**Single-child provinces.** `LD`'s polygon is byte-copied from `DL` in Phase 1
precisely so this step is degenerate. Assert `unassigned === 0` for them — a
non-zero tally means the byte-copy did not happen and the tolerance mismatch is
back.

### File format

Header gains `districts`, `districtCounts`, `districtCells`, `unassigned`; each
entry gains `d`, an index into `districts`:

```json
 "code": "TPHCM",
 "districts": ["TPHCM-Q1","TPHCM-Q3", ...],
 "districtCounts": {"TPHCM-Q1": 3211, ...},
 "districtCells":  {"TPHCM-Q1": 274, ...},
 "unassigned": 412,
 "panos": [
  {"id":"1234","lat":10.7712,"lng":106.7003,"d":0},
  {"id":"5678","lat":10.7799,"lng":106.7101}
 ]
```

**H3 — the size budget was wrong.** `,"d":12` is 8 bytes, not 5. Measured against
real entry counts: HN 225,985 + TPHCM 184,992 + DH 11,718 + DN 1,521 + DL 475
gives **≈ 2.8-3.4 MB** of growth, against the earlier 2.5 MB gate. **Budget:
3.5 MB.** The old "2.1 MB saved" line compared against an alternative that was
never on the table and is deleted.

The one-panorama-per-line writer is preserved: a 226k-entry file must stay
diffable.

### M2 — playability is measured in places, not entries

`GRID_DEG = 0.0003` (~33 m) means a single street corridor yields dozens of
entries, so raw counts overstate distinct *places* by roughly 30×. Measured:
Da Nang's 1,521 panoramas occupy **39** distinct 0.01° (~1.1 km) cells across 7
districts; Da Lat's 475 occupy **8**.

`districtCells` records the distinct-cell count per leaf. A node is playable when
it has **≥ 3 distinct cells and ≥ 3 panoramas**. The panorama floor matters
because `fetchCityPanorama` retries up to `MAX_ATTEMPTS = 3` with a different
candidate each time (`mapillary.js:86-91`); a 1-panorama leaf whose image has
been deleted upstream throws on attempt 2.

Leaves between 3 and 10 cells are flagged `thin: true` so Phase 5 can label them
rather than silently offering a two-street district.

### Runtime API

`src/lib/pano-index.js`:

| Function | Behaviour |
|---|---|
| `getRegionPanos(code)` | Leaf → memoised bucket. Province → the whole index. `VN` → never materialised |
| `pickRandomPano(code, excludeIds)` | Returns `{ id, lat, lng, regionCode }` — the leaf, or the province when unassigned |
| `countPanos(code)` | Works at every level |
| `playableRegions()` | Every node meeting the cells-and-count threshold |

Buckets are built once per province on first leaf access and cached in a
module-level `Map`. This is process-global and never invalidated — correct,
because the data is static and bundled, but state it plainly: ~425k retained
references, bounded, no leak.

**`VN` draws** never concatenate 424,691 entries. Pick a province uniformly, then
delegate. Uniform over panoramas would make Vietnam 53% Ha Noi and 44% Ho Chi
Minh, with Da Lat at 0.1%.

### C2 — `src/lib/mapillary.js` is the missing link

`/api/new-game` never calls `pickRandomPano`. It calls `fetchCityPanorama`
(`new-game/route.js:33`), the sole production caller (`mapillary.js:14,90`),
which returns `{...image, lat, lng}` and **discards everything else on the
candidate**. Without a change here `session.regionCode` can only ever be the
picked code, every district board stays empty forever, and Phase 3's tests still
pass because they call `submitScore` directly.

Two changes:

1. `fetchCityPanorama(regionCode)` returns `data.regionCode` taken from the
   **winning** candidate — not the first. The retry loop draws a fresh candidate
   per attempt, potentially from a different district.
2. Move the `pickRandomPano` call inside the `try` (it sits on `mapillary.js:90`,
   outside the `try` that opens on `:93`), so pool exhaustion returns
   `{success: false}` instead of escaping to the route's generic 500.

## Related Code Files

- Create: `scripts/assign-pano-districts.mjs`
- Create: `scripts/lib/assign-districts.mjs` (shared with the index build)
- Create: `src/data/regions/counts.js` (generated)
- Modify: `src/data/panos/hn.json`, `dn.json`, `tphcm.json`, `ld.json`, `la.json`
- Modify: `src/data/panos/index.js` (regenerated; rejects unknown province codes)
- Modify: `src/lib/pano-index.js`
- Modify: `src/lib/mapillary.js` — propagate `regionCode`; move the draw inside `try`
- Modify: `scripts/build-pano-index.mjs` — shared module; default list → `['HN','TPHCM','DN','LD','LA']`
- Modify: `tests/pano-index.test.js`

## Implementation Steps

1. Write `scripts/lib/assign-districts.mjs`: bbox prefilter, early exit, the
   nearest-centroid fallback for stranded points, and the cell counter.
2. Write `scripts/assign-pano-districts.mjs` around it, including the re-clip
   pass and the header `bbox`/`count` rewrite (H7).
3. Run it. Check the unassigned tally: above 2% for a province means Phase 1's
   leaf tolerance is too loose — tighten and re-run, no network cost.
4. Verify single-child provinces report `unassigned === 0`.
5. Record leaves below the playability threshold. Da Nang's rural leaves and
   `TPHCM-CUCHI` (zero panoramas, unresolved boundary) are expected.
6. Emit `src/data/regions/counts.js`.
7. Update `build-pano-index.mjs`: shared module, corrected default list, barrel
   guard against unknown province files.
8. Rewrite `src/lib/pano-index.js` per the table above.
9. Update `src/lib/mapillary.js` for C2.
10. Extend `tests/pano-index.test.js`.
11. `npm test`, then `npm run build:check`.

## Validation

- Per-province unassigned tally under 2%, asserted against the header field.
- `sum(districtCounts) + unassigned === panos.length` for every province.
- Single-child provinces: `unassigned === 0`.
- Panoramas assigned to leaf L are inside L's boundary, sampled at the existing
  ~200-point stride.
- The two containment assertions in `tests/pano-index.test.js` pass **unweakened**
  after the re-clip.
- `countPanos('VN')` equals the sum of the five provinces — and does not
  double-count, verified by asserting `PANO_INDEXES` has exactly five keys.
- 200 draws at `VN` hit at least four distinct provinces.
- 100 draws at a leaf all report that leaf as `regionCode`.
- A `VN` draw's `regionCode` is a leaf code, never `'VN'`.
- `fetchCityPanorama` returns the `regionCode` of the attempt that succeeded:
  force attempt 1 to fail and assert the reported leaf matches attempt 2's
  candidate.
- Pool exhaustion returns `{success: false}`, not a thrown error.
- `src/data/panos/` grows by less than 3.5 MB.

## Risk Assessment

**Gaps between simplified district outlines strand panoramas.** *Signal:*
unassigned above 2%. *Response:* tighten Phase 1's leaf tolerance and re-run —
free, no network. Residual strays fall back to the nearest leaf centroid rather
than staying province-only.

**Point-in-polygon is slower than estimated.** *Signal:* the Ha Noi pass exceeds
~10 minutes. *Response:* a coarse grid index over leaf bboxes. Build-time only,
no runtime effect.

**The re-clip drops more panoramas than expected.** *Signal:* a province's count
falls by more than a few percent. *Response:* that is the HN union changing
shape; inspect whether the union is missing a district before accepting the loss.

**A leaf passes the threshold but is still one street.** *Signal:* `districtCells`
between 3 and 10. *Response:* the `thin` flag exists for exactly this; Phase 5
labels it rather than hiding it.

**`build-pano-index.mjs` is run argument-less and resurrects the old files.**
*Signal:* `PANO_INDEXES` gains `DL`/`DH` keys. *Response:* the barrel guard
rejects unknown province filenames; the five-key assertion catches it in tests.

## Success Criteria

- [ ] All five province indexes carry `districts`, `districtCounts`, `districtCells`, `unassigned`, and per-entry `d`
- [ ] Unassigned under 2% per province; zero for single-child provinces
- [ ] The re-clip pass ran and the containment assertions pass unweakened
- [ ] Zero new Mapillary requests
- [ ] `pickRandomPano` works at leaf, province, and country level and reports the resolving leaf
- [ ] `fetchCityPanorama` propagates the **winning** attempt's leaf
- [ ] A `VN` draw is province-uniform, not panorama-uniform
- [ ] `playableRegions()` gates on distinct cells and panorama count, not `count > 0`
- [ ] `PANO_INDEXES` has exactly five keys
- [ ] `src/data/regions/counts.js` generated
- [ ] `src/data/panos/` growth under 3.5 MB
- [ ] `npm test` and `npm run build:check` pass
