---
phase: 1
title: "Region tree model and boundaries"
status: completed
priority: P1
effort: "1.5d"
dependencies: []
---

# Phase 1: Region tree model and boundaries

## Outcome (recorded after execution)

**60 of 61 leaves resolved.** Cu Chi is the only unresolved one, matching the
`"missingParts": 1` the shipped TPHCM boundary already carried. Ha Noi unions to
3,363 km² (real Ha Noi ≈ 3,359), Ho Chi Minh to 1,629 km² — identical to the
pre-change file.

Four things differ from the plan as written:

1. **Nominatim needed a two-form lookup.** The first run resolved only 42 of 61,
   and every failure was a `Huyện` or `Thị xã` — no `Quận` failed. The cause is
   not rate limiting: OSM has applied the 2025 merger, so the pre-2025 rural
   districts survive only as `boundary/historic` relations whose rendered parent
   is the *current* province. `Huyện Ba Vì, Hà Nội, Việt Nam` matches nothing;
   `Huyện Ba Vì, Việt Nam` returns relation 7115003, correctly shaped but
   labelled "Ba Vì District, Phú Thọ Province". The fix is to try the qualified
   form, then the bare one, and validate the hit's centroid against the parent's
   pre-2025 bbox (`legacyBbox` in the config) so a same-named unit elsewhere in
   the country is rejected. Cu Chi has no boundary relation left at all — only
   cemeteries and bus stops — so it is genuinely unresolvable.
2. **Boundaries are grouped by province** (`<province>/<code>.json`) at the
   user's request; 66 files in one directory was unreadable.
3. **The re-clip pass was pulled forward from Phase 2**, which is the response
   this phase's own risk register pre-decided for H7. It dropped 74 panoramas of
   424,691 (0.017%) that fell outside the retightened outlines. It lives in
   `scripts/assign-pano-districts.mjs`, which Phase 2 extends with district
   assignment.
4. **`CITY_BOUNDARIES` was renamed `REGION_BOUNDARIES`**, with its one consumer
   updated.

`scripts/build-region-boundaries.mjs --regenerate` rebuilds provinces, the barrel
and the tree from the leaf polygons on disk without touching Nominatim. Added
after the subfolder move, so reshaping outputs never costs another 60-request
pass against a courtesy-rate-limited public service.

**Measured:** `src/data/boundaries/` is 1.3 MB against the 1.5 MB budget — about
9× the old 131 KB, confirming that the pre-red-team "well under 125 KB" estimate
was impossible. `npm test` 135/135, `npm run build:check` and `npm run lint`
clean, with no assertion weakened.

## Overview

Turn the hand-maintained flat `CITIES` map into a generated three-level region
tree, and build a boundary polygon for all 61 leaves. Everything downstream reads
the tree, so this phase lands first and alone.

**Red-team: three Critical findings land here.** Fix the barrel identifier
generation *before* the first Nominatim run (C1), keep the existing test suite
green (C3), and keep `src/lib/regions.js` free of panorama imports (C5).

## Requirements

**Functional**
- One country, five provinces, 61 leaves, all reachable from one generated map.
- Every leaf Nominatim resolves carries a boundary polygon.
- A province polygon is the union of its children — except a single-child
  province, which byte-copies its child.
- `VN` has no polygon; its bbox and center derive from its children's bboxes.
- Lam Dong and Long An carry `partialCoverage: 'one town covered'`.
- The five existing hand-picked centers survive as overrides.

**Non-functional**
- Both generated barrels must parse. Hyphenated codes are illegal as bare JS
  identifiers *and* as unquoted object keys.
- `src/lib/regions.js` imports only `src/data/regions/*`. Client components
  import it; the panorama data is 25 MB of exact answers.
- `npm test` and `npm run build:check` pass **at the end of this phase**, with no
  assertion weakened to achieve it.
- Nominatim's one-request-per-second courtesy limit is respected (61 queries
  ≈ 70 s).

## Architecture

`scripts/build-city-boundaries.mjs` is renamed `scripts/build-region-boundaries.mjs`
and its `CITIES` config becomes a `REGIONS` config where a leaf carries a
Nominatim `query` and a province carries only a name plus its children.

```js
const REGIONS = {
  VN: { name: 'Vietnam', level: 'country' },

  TPHCM: { name: 'Ho Chi Minh', level: 'province', parent: 'VN',
           center: [10.8231, 106.6297] },              // override, see below
  'TPHCM-Q1': { name: 'District 1', level: 'district', parent: 'TPHCM',
                query: 'Quận 1, Thành phố Hồ Chí Minh, Việt Nam' },
  // ...

  LD: { name: 'Lam Dong', level: 'province', parent: 'VN',
        partialCoverage: 'one town covered' },
  DL: { name: 'Da Lat', level: 'district', parent: 'LD',
        query: 'Thành phố Đà Lạt, Việt Nam', center: [11.9404, 108.4583] },

  LA: { name: 'Long An', level: 'province', parent: 'VN',
        partialCoverage: 'one town covered' },
  DH: { name: 'Duc Hoa', level: 'district', parent: 'LA',
        query: 'Đức Hòa, Việt Nam', center: [10.8888, 106.3825] },
};
```

The existing `parts` lists for `TPHCM` (22) and `DN` (7) already enumerate exactly
the districts needed — lift them across as leaf queries. `HN` currently has a
single part and needs its 30 units enumerated.

### C1 — Barrel identifier generation (do this first)

Both writers derive the import identifier *and* the object key from the filename:

```js
// build-city-boundaries.mjs:190-192, 200-203  — and the identical block in
// build-pano-index.mjs:273-287
ident: name.replace(/\.json$/, ''),
`import ${e.ident} from './${e.file}';`
`  ${e.code}: ${e.ident},`
```

For `tphcm-q1.json` that emits `import tphcm-q1 from './tphcm-q1.json';` and
`TPHCM-Q1: tphcm-q1,` — two parse errors. Because the barrel is rewritten after
every region (`build-city-boundaries.mjs:210`), the repo breaks from leaf #1 and
stays broken for the rest of a 70-second network run.

Fix both scripts before running either:

```js
ident: name.replace(/\.json$/, '').replace(/[^a-z0-9]/g, '_'),
`import ${e.ident} from './${e.file}';`
`  ${JSON.stringify(e.code)}: ${e.ident},`      // quoted key
```

Add a test that `import()`s each generated barrel.

### H4 — Centers are overridable, not replaced

`src/lib/game.js:9-12` records why the five centers are hand-picked: a centroid
"for an irregular outline can land somewhere no one associates with the place",
and `GameClient.js:102` seeds the map from it. The build computes
`turf.centerOfMass` (`build-city-boundaries.mjs:150`); use it only when the
`REGIONS` entry has no `center`. Seed the five existing values as overrides and
keep a test asserting they are unchanged.

### H3 — Simplification, with a measured budget

`SIMPLIFY_TOLERANCE = 0.0005` (~55 m) currently applies to five whole-city
outlines totalling **130,519 bytes**. At district scale that tolerance opens
gaps along shared borders that Phase 2 must assign panoramas across.

Simplify **leaves** at `0.0001` (~11 m) and keep `0.0005` for unioned province
outlines. The earlier draft claimed this would "stay well under 125 KB", which is
arithmetically impossible: 5× the vertex density over more total arc length, with
every interior border now drawn twice (once per neighbour). **Budget: 1.5 MB for
`src/data/boundaries/` combined.** Step 9 checks it and fails the phase if
exceeded. Do not loosen the tolerance to hit the budget — Phase 2's unassigned
tally is the quality bar, and loosening reopens the gaps.

### H7 — The Ha Noi union changes HN's outline

HN today is one OSM relation (`build-city-boundaries.mjs:32`). Rebuilding it as a
union of 30 districts moves the outline, so panoramas clipped against the old
polygon may now fall outside — breaking two containment assertions
(`tests/pano-index.test.js:34-42`, `:44-59`) that no re-clip repairs, because
Phase 2 does not re-fetch tiles.

Resolve it here: Phase 2 gains a **re-clip pass** over the existing panoramas
(no network — it drops out-of-boundary entries and rewrites the header
`bbox`/`count`). This phase records the expectation; Phase 2 owns the step. The
containment assertions stay in force throughout — do not weaken them.

### C3 — Keeping the test suite green

`tests/pano-index.test.js:5,7` derives its parameter list from `CITIES`:

```js
import { CITIES } from '../src/lib/game.js';
const CODES = Object.keys(CITIES);
```

Two changes make this work at the end of *this* phase:

1. **`CITIES` becomes every node in the tree**, keyed by code — not the five
   provinces. `cityNames['DL']`, `cityCenters['HN']`, and `CITIES['DL']?.bbox`
   all keep resolving, so `/game?location=DL` and `GameClient.js:463` survive.
   `cities` (the UI list) is the province filter.
2. **Move the panorama file rename into this phase.** `dl.json` → `ld.json` and
   `dh.json` → `la.json`, so every index file is a province. It is a pure rename
   with no network cost, and leaving it in Phase 2 is what stranded `LD`/`LA`
   without an index.

`tests/pano-index.test.js` then derives `CODES` from `indexedCities()` rather
than `CITIES`, and its seven hardcoded `'DL'` sites (`:68, 69, 73, 76, 80, 81,
86`) become `'LD'`. Add the file to this phase's list.

### Region codes

| Province | Leaf codes |
|---|---|
| `HN` (30) | `HN-BADINH` `HN-HOANKIEM` `HN-TAYHO` `HN-LONGBIEN` `HN-CAUGIAY` `HN-DONGDA` `HN-HAIBATRUNG` `HN-HOANGMAI` `HN-THANHXUAN` `HN-BACTULIEM` `HN-NAMTULIEM` `HN-HADONG` `HN-SONTAY` `HN-BAVI` `HN-CHUONGMY` `HN-DANPHUONG` `HN-DONGANH` `HN-GIALAM` `HN-HOAIDUC` `HN-MELINH` `HN-MYDUC` `HN-PHUXUYEN` `HN-PHUCTHO` `HN-QUOCOAI` `HN-SOCSON` `HN-THACHTHAT` `HN-THANHOAI` `HN-THANHTRI` `HN-THUONGTIN` `HN-UNGHOA` |
| `TPHCM` (22) | `TPHCM-Q1` `TPHCM-Q3` `TPHCM-Q4` `TPHCM-Q5` `TPHCM-Q6` `TPHCM-Q7` `TPHCM-Q8` `TPHCM-Q10` `TPHCM-Q11` `TPHCM-Q12` `TPHCM-BINHTAN` `TPHCM-BINHTHANH` `TPHCM-GOVAP` `TPHCM-PHUNHUAN` `TPHCM-TANBINH` `TPHCM-TANPHU` `TPHCM-THUDUC` `TPHCM-BINHCHANH` `TPHCM-CANGIO` `TPHCM-CUCHI` `TPHCM-HOCMON` `TPHCM-NHABE` |
| `DN` (7) | `DN-HAICHAU` `DN-THANHKHE` `DN-SONTRA` `DN-NGUHANHSON` `DN-LIENCHIEU` `DN-CAMLE` `DN-HOAVANG` |
| `LD` (1) | `DL` |
| `LA` (1) | `DH` |

Districts 2 and 9 are absent from Ho Chi Minh City on purpose: both merged into
Thu Duc in 2021, which the existing `parts` list already reflects.

`TPHCM-CUCHI` is listed but **expected to fail resolution** — the shipped
boundary already records `"missingParts": 1` for it, which is why zero of
TPHCM's 184,992 panoramas sit in Cu Chi. Record the failure; do not chase it.

`DL` and `DH` keep their bare codes so their existing leaderboard keys stay valid.
Hoang Sa stays excluded from Da Nang for the reason already in the build script.

### Missing leaves are recorded, not fatal

The empirical Nominatim hit rate on this repo's own queries is 28/29; over 61
leaves expect one or two failures beyond Cu Chi. A missing leaf:

- is written to the tree with `coverage: 'unresolved'` and no bbox,
- increments the parent's `missingParts`,
- is excluded from playability,
- does **not** fail the build.

### Traversal helpers

`src/lib/regions.js` (new, hand-written, client-safe):

| Function | Returns |
|---|---|
| `getRegion(code)` | Node, or throws with the list of known codes |
| `ancestorsOf(code)` | `[self, ...parents]` up to and including `VN` |
| `childrenOf(code)` | Direct children, empty for a leaf |
| `leavesUnder(code)` | Every leaf at or below the node |
| `provinceOf(code)` | The province ancestor, or `null` for `VN` |
| `regionPath(code)` | Ancestor names, country first — for UI headers |

It imports `src/data/regions/index.js` and (from Phase 2) `counts.js`. Nothing
else. A test walks its import graph and fails if `src/data/panos/` appears.

## Related Code Files

- Create: `scripts/build-region-boundaries.mjs` (from `build-city-boundaries.mjs`)
- Create: `src/lib/regions.js`
- Create: `src/data/regions/index.js` (generated)
- Create: `src/data/boundaries/<leaf codes>.json` (generated)
- Create: `tests/regions.test.js`
- Modify: `scripts/build-pano-index.mjs` — barrel identifier fix (C1) only
- Modify: `src/lib/game.js` — derive exports from the tree; `CITIES` = all nodes
- Modify: `src/data/boundaries/index.js`, `src/data/panos/index.js` (regenerated)
- Rename: `src/data/panos/dl.json` → `ld.json`, `dh.json` → `la.json`
- Modify: `tests/pano-index.test.js` — `CODES` from `indexedCities()`; 7 `'DL'` sites → `'LD'`
- Modify: `tests/game.test.js` — city-configuration block becomes tree assertions
- Delete: `scripts/build-city-boundaries.mjs`

## Implementation Steps

1. **Fix both barrel writers first** (C1): sanitise `ident`, quote the object key.
   Add the barrel-parses test. Do this before any network run.
2. Copy `build-city-boundaries.mjs` to `build-region-boundaries.mjs`; replace
   `CITIES` with the `REGIONS` config, lifting the existing `TPHCM` and `DN` part
   lists and enumerating Ha Noi's 30. Seed the five `center` overrides.
3. Split `buildCity` into `buildLeaf` (one query, tolerance `0.0001`) and
   `buildProvince` (union children at `0.0005`; byte-copy for a single child).
4. Add the `VN` step: no query, bbox as the envelope of the five province bboxes.
5. Extend both `writeBarrel`s to emit `src/data/boundaries/index.js` and
   `src/data/regions/index.js`.
6. Run it. Log unresolved leaves; record them, do not abort.
7. Rename the two panorama files and regenerate the panorama barrel.
8. Write `src/lib/regions.js`; rewrite `src/lib/game.js`'s region exports as
   derivations over every node.
9. Write `tests/regions.test.js`; update `tests/pano-index.test.js` and the
   `city configuration` block in `tests/game.test.js`. Check the boundary
   directory against the 1.5 MB budget.
10. `npm test`, then `npm run build:check`.

## Validation

- Both generated barrels parse under `import()`.
- `src/data/boundaries/` is under 1.5 MB.
- `tests/regions.test.js` asserts: every `parent` resolves; no cycles; exactly one
  node with `parent: null`; every resolved leaf's bbox sits inside its province's;
  `ancestorsOf` on every leaf has length 3 and ends at `VN`; 61 unique leaf codes;
  `DL`/`DH` parents are `LD`/`LA`.
- The five legacy centers are byte-identical to today's values.
- `src/lib/regions.js`'s transitive imports never reach `src/data/panos/`.
- `getRegion('DL')`, `cityNames['DL']`, and `CITIES['DL'].bbox` all resolve.
- A resolved province's area is within 2% of the sum of its children's.
- A single-child province's polygon is byte-identical to its child's.
- `npm test` passes with **no assertion weakened** — in particular the two
  containment assertions in `tests/pano-index.test.js` remain in force.

## Risk Assessment

**Nominatim cannot resolve some leaves.** Expected: one or two beyond Cu Chi, at
the observed 28/29 rate. *Signal:* the build logs `no boundary found — SKIPPED`.
*Response:* refine the query string; if still unresolvable, record
`coverage: 'unresolved'` and move on. Not a build failure.

**Leaf boundaries exceed the 1.5 MB budget.** *Signal:* step 9's check fails.
*Response:* raise the leaf tolerance to `0.0002` and re-measure — but only after
confirming with a Phase 2 dry run that the unassigned tally stays under 2%.
Loosening tolerance to hit a size budget is the trade that strands panoramas.

**The HN union invalidates containment tests before Phase 2's re-clip.** *Signal:*
`HN panoramas sit inside the city boundary` fails at the end of this phase.
*Response:* pull the re-clip pass forward into this phase rather than weakening
the assertion. It needs no network.

**Renaming the build script breaks a reference.** Verified reference set is five
sites, all in `scripts/` and one generated header — `grep -rn
"build-city-boundaries" docs/ CLAUDE.md` returns nothing, contrary to the earlier
draft. *Response:* update the five; Phase 6 re-greps.

## Success Criteria

- [ ] Both generated barrels parse; a test enforces it
- [ ] `src/data/regions/index.js` exports 67 nodes: 1 country, 5 provinces, 61 leaves
- [ ] Unresolved leaves are recorded with `coverage: 'unresolved'`, not fatal
- [ ] Every resolved province polygon is the union of its children; single-child provinces byte-copy
- [ ] The five legacy centers are unchanged
- [ ] `LD` and `LA` carry `partialCoverage: 'one town covered'`
- [ ] `ancestorsOf('DL')` is `['DL', 'LD', 'VN']`; `ancestorsOf('DH')` is `['DH', 'LA', 'VN']`
- [ ] `src/lib/regions.js` never imports panorama data
- [ ] Panorama files renamed to `ld.json` / `la.json`; barrel regenerated
- [ ] `src/data/boundaries/` under 1.5 MB
- [ ] `npm test` and `npm run build:check` pass with no assertion weakened
