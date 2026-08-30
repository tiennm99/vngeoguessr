---
title: "Nested Region Tree"
description: "Replace the flat five-city model with a country > province > district tree whose scores roll upward, preserving all existing leaderboard points."
status: pending
priority: P1
effort: "4-6d"
tags: [data-model, leaderboard, region-tree]
created: 2026-08-30
blockedBy: []
blocks: []
---

# Nested Region Tree

## Overview

Today the game knows five flat "cities" (`HN`, `DN`, `TPHCM`, `DL`, `DH`), each
with one boundary polygon, one panorama index, and one pair of leaderboards,
plus a single country-wide pair keyed `leaderboard:vietnam` / `distance:vietnam`.

This plan replaces that with a three-level tree:

```
VN (Vietnam)
├── HN     Ha Noi          → 30 districts
├── DN     Da Nang         →  7 districts
├── TPHCM  Ho Chi Minh     → 22 districts
├── LD     Lam Dong        →  1 town   (DL  Da Lat)   — partial coverage
└── LA     Long An         →  1 town   (DH  Duc Hoa)  — partial coverage
```

A guess resolves to the **leaf** the panorama sits in, then credits that leaf,
its province, and `VN`. Every node is playable: choosing a province draws a
panorama from anywhere inside it; choosing `VN` draws from anywhere covered.

**Administrative basis.** The repo deliberately uses **pre-2025-merger** extents
(`scripts/build-region-boundaries.mjs` header explains why: post-merger Ho Chi Minh
City spans 36,566 km² and reaches Vung Tau, which is not a guessable area against
scoring bands that top out at 1 km). This plan keeps that basis, so districts are
the pre-2025 quận/huyện/thị xã, and Duc Hoa's parent is **Long An** — not the
post-2025 Tay Ninh it was merged into.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | A single generated region tree replaces the hand-maintained `CITIES` map and the duplicated bbox/center data | P1 |
| 2 | Guessing in a district credits the district, its province, and Vietnam | P1 |
| 3 | Every existing leaderboard point survives the change, untouched | P1 |
| 4 | Any node — country, province, or leaf — is selectable and playable | P1 |
| 5 | District panorama assignment reuses the panoramas already on disk; no province is re-fetched | P1 |
| 6 | Adding a province or district later is a data edit plus a build run, not a code change | P2 |
| 7 | Absent coverage is self-describing: a maintainer can classify any empty node without asking | P2 |

## Non-Goals

- Adding provinces or districts beyond the five provinces already covered. The
  tree makes future additions cheap; none are planned now.
- Resolving Cu Chi. It is already absent from the shipped TPHCM boundary
  (`"missingParts": 1`) and therefore from its panorama index. Fixing it costs
  Mapillary tile requests; the user has accepted the gap. See *Coverage note*.
- Changing the 0-5 scoring bands, the distance formula, or the 200-entry cap.
- Bonus multipliers. Lam Dong and Long An carry a *partial coverage* label only;
  they score exactly like any other province.
- Post-2025 administrative boundaries.
- Fixing the pre-existing read-then-write race in `submitScore`, or adding
  request pipelining to the Upstash adapter (see Risks).
- Rate limiting. None exists today; adding it is unrequested scope.
- Gating the debug API. `/api/debug/*` is unauthenticated with no environment
  gate, and `/api/debug/city-coverage` serves up to 40,000 exact panorama
  coordinates per request. Combined with the image id `/api/new-game` returns,
  that is a complete anti-cheat bypass: sweep once, build an id-to-coordinates
  table, score 5/5 forever. Pre-existing since `b0a090f`, surfaced by the
  Phase 2 review, and **accepted by the user as a known exposure**. Recorded
  here so it is a decision rather than an oversight.

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Aggregation | Write fan-out (leaf + province + country on every guess) | Preserves pre-existing parent totals for free; derive-on-read would orphan them |
| Leaf codes for Da Lat / Duc Hoa | Keep `DL` / `DH` verbatim | Their leaderboard keys already exist; renaming would strand the history |
| Redis key prefix | Keep `leaderboard:city:` / `distance:city:` | Renaming to `:region:` would strand every existing key. Naming purity loses to data preservation |
| Redis key names in this plan | All **logical**; physical form is `${KEY_PREFIX}${logical}`, default `vngeoguessr:` | The adapter applies the prefix invisibly (`upstash.js:34,40-42`). A migration that bypasses it silently reads an empty namespace |
| `VN` key mapping | Special-cases to the legacy `leaderboard:vietnam` / `distance:vietnam` | Keeps the existing global leaderboard as the country node |
| Legacy province points | Stay on the province node | Old HN/DN/TPHCM points predate districts and are unattributable; province totals stay continuous, district totals start at zero |
| New province nodes | `LD` and `LA` backfilled by copying `DL` / `DH` sorted sets once | Their only child already holds the full history; without a backfill the province would disagree with its child |
| District panoramas | Partition the **existing** province indexes by point-in-polygon | A per-district tile fetch would multiply the 2,800-tile budget against a 50,000/day cap for data we already hold |
| Province geometry | Derived as the union of its children — except a single-child province, which byte-copies its child's polygon | Removes parent/child drift. Re-simplifying a single child at a looser tolerance would strand its own panoramas in the gap |
| Country geometry | None; bbox and center derived from children | The real Vietnam outline is huge and irrelevant — coverage is five provinces |
| Node centers | Generated centroid, overridable per node; the five existing centers are seeded as overrides | `game.js:9-12` documents why these are deliberately *not* polygon centroids |
| `VN` random draw | Pick a province uniformly, then a panorama within it | Uniform over all 424,691 panoramas would make "Vietnam" 97% Ha Noi + Ho Chi Minh |
| Province random draw | Unchanged: uniform over the province's panoramas | Preserves today's behaviour for existing entry points |
| **`VN` scores zero and ships anyway** | Accepted trade-off, not a defect | `calculateScore` returns 0 above 1 km and the five provinces span ~1,100 km. `VN` is an exploration mode. **Do not "fix" this by rescaling the bands** — the user decided it explicitly |
| Panorama counts for the UI | A second generated file, `src/data/regions/counts.js` | Keeps one writer per generated file, keeps the tree client-safe, and removes the need for a `/api/regions` route |
| Phase 5 primitives | Add `@radix-ui/react-accordion` and `@radix-ui/react-select` | Neither exists in `src/components/ui/`. Hand-rolling both would ship broken a11y. **`package.json` change — apply manually** |
| Boundary file layout | `src/data/boundaries/<province>/<code>.json` | 66 files in one flat directory is unreadable, and every leaf belongs to exactly one province |
| Nominatim query strategy | Qualified form, then bare form, with the hit's centroid validated against the parent's pre-2025 bbox | Discovered in execution: OSM has applied the 2025 merger, so pre-2025 districts survive only as `boundary/historic` relations whose rendered parent is the *current* province. A qualified query matches nothing; a bare one can match a same-named unit in another province. See Phase 1 |
| Panorama file layout | Stays flat — one file per province | Five files, one per province forever. A directory per file would be noise; the boundary case is 31 files under `hn/` |

## Architecture

### Region tree

Two generated files, one writer each, both small and client-safe:

- `src/data/regions/index.js` — written by the boundary build. Node code, name,
  parent, level, center, bbox, `partialCoverage`.
- `src/data/regions/counts.js` — written by the district-assignment build.
  Per-node panorama count, distinct-cell count, and playability.

```js
// src/data/regions/index.js
export const REGIONS = {
  VN:    { code: 'VN',    name: 'Vietnam',     parent: null, level: 'country',  center: [...], bbox: [...] },
  TPHCM: { code: 'TPHCM', name: 'Ho Chi Minh', parent: 'VN', level: 'province', center: [...], bbox: [...] },
  'TPHCM-Q7': { code: 'TPHCM-Q7', name: 'District 7', parent: 'TPHCM', level: 'district', center: [...], bbox: [...] },
  LD:    { code: 'LD', name: 'Lam Dong', parent: 'VN', level: 'province', partialCoverage: 'one town covered', ... },
  DL:    { code: 'DL', name: 'Da Lat',   parent: 'LD', level: 'district', ... },
  LA:    { code: 'LA', name: 'Long An',  parent: 'VN', level: 'province', partialCoverage: 'one town covered', ... },
  DH:    { code: 'DH', name: 'Duc Hoa',  parent: 'LA', level: 'district', ... },
};
```

`src/lib/regions.js` — hand-written traversal over those two files and **nothing
else**. It must never import `src/data/panos/` or `src/lib/pano-index.js`: client
components import it, and the panorama data is 25 MB of exact answers. A test
asserts that import boundary.

**Codes.** Provinces keep their current codes. Districts are
`<PARENT>-<SLUG>` (`HN-BADINH`, `TPHCM-Q7`, `DN-HAICHAU`). `DL` and `DH` are the
two exceptions, keeping their bare historical codes.

Hyphenated codes are **not** legal JS identifiers or bare object keys. Both
barrel writers derive both from the filename today
(`build-city-boundaries.mjs:190-203`, `build-pano-index.mjs:273-287`) and must be
fixed before the first leaf is written.

### Panorama partition

`src/data/panos/<province>.json` gains a header `districts` array and a `d`
field per entry — an **index** into that array:

```json
 "districts": ["TPHCM-Q1","TPHCM-Q3", ...],
 "districtCounts": {"TPHCM-Q1": 3211, ...},
 "districtCells":  {"TPHCM-Q1": 274, ...},
 "unassigned": 412,
 "panos": [ {"id":"...","lat":10.77,"lng":106.70,"d":0} ]
```

An entry with no `d` fell in a gap between simplified district outlines. It is
still playable at province level and credits province + country only.

`districtCells` counts distinct 0.01° (~1.1 km) cells, because raw counts
overstate distinct *places* by roughly 30× — the index is thinned at 33 m, so a
single street corridor yields dozens of entries. Da Nang's 1,521 panoramas
occupy 39 cells in total; Da Lat's 475 occupy 8.

### Score fan-out

```
POST /api/guess
  session.regionCode        (leaf resolved from the winning draw — server-side only)
    → ancestorsOf(regionCode) = ['TPHCM-Q7', 'TPHCM', 'VN']
      → submitScore / submitDistanceRecord write all three
```

`session.regionCode` is a **secret**, alongside `exactLocation`: it names the
district the panorama is in. Neither is ever serialized to the client before the
guess. Responses carry `pickedRegion` only.

### Data flow

```
build-region-boundaries.mjs        (Nominatim, up to 2 queries per leaf)
  → src/data/boundaries/<province>/<code>.json   (leaves + province outline)
  → src/data/boundaries/index.js      (barrel, sanitised identifiers)
  → src/data/regions/index.js         (tree: names, parents, centers, bboxes)
  --regenerate                        (rebuild provinces/barrel/tree from disk,
                                       no network — for reshaping outputs)

assign-pano-districts.mjs          (no network)
  → re-clips src/data/panos/<province>.json against the current outline  [done in Phase 1]
  → rewrites it with districts[] + d
  → src/data/regions/counts.js        (counts, cells, playability)

migrate-leaderboards.mjs           (after deploy; --dry-run default)
  → copies leaderboard:city:dl → :ld, distance:city:dl → :ld
  → copies leaderboard:city:dh → :la, distance:city:dh → :la
```

## Coverage note

Canonical text lives in `docs/project-overview.md` (Phase 6 writes it). Its
substance, recorded here because it is a durable decision:

Coverage is deliberately partial and will grow in future releases; **none are
planned at present**. Absent coverage has three distinct causes, and only one is
a defect:

1. **Not yet added** — any province outside the five. Roadmap. Adding one is an
   entry in `scripts/build-region-boundaries.mjs` plus three build runs, no
   application code change.
2. **No street imagery** — a district where Mapillary holds no panoramas,
   typically rural. Listed in the tree, excluded from play. May self-resolve on
   a future index rebuild.
3. **Missing from the boundary** — a district whose OSM lookup did not resolve,
   so it never entered the province union and its panoramas were clipped away.
   Cu Chi is the known case (`"missingParts": 1` in
   `src/data/boundaries/tphcm.json`). Fixable, but costs Mapillary tile requests
   against a 50,000/day cap, which is why it is not automatic.

`missingParts` in a province's boundary file distinguishes the third from the
first two.

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|-----------|
| 1 | [Phase 1: Region tree model and boundaries](./phase-01-region-tree-model-and-boundaries.md) | Completed | — |
| 2 | [Phase 2: Panorama district partition](./phase-02-panorama-district-partition.md) | Completed | 1 |
| 3 | [Phase 3: Leaderboard fan-out and migration](./phase-03-leaderboard-fan-out-and-migration.md) | Pending | 1 |
| 4 | [Phase 4: API surface](./phase-04-api-surface.md) | Pending | 2, 3 |
| 5 | [Phase 5: UI region navigation](./phase-05-ui-region-navigation.md) | Pending | 4 |
| 6 | [Phase 6: Docs and verification](./phase-06-docs-and-verification.md) | Pending | 5 |

## Success Criteria

- [ ] `src/data/regions/index.js` holds 1 country, 5 provinces, and 61 leaves, all generated
- [ ] Both generated barrels parse — a test `import()`s them
- [ ] Every leaf that Nominatim resolved has a boundary polygon; unresolved leaves are recorded in `missingParts`, not fatal
- [ ] Every panorama in the five province indexes carries a district assignment, or is counted in a reported unassigned tally under 2%
- [ ] `src/lib/regions.js`'s import graph never reaches `src/data/panos/` — asserted by test
- [ ] A guess in `TPHCM-Q7` increases the `TPHCM-Q7`, `TPHCM`, and `VN` score totals by the same amount
- [ ] The leaf is resolved from the **winning** panorama draw, server-side, and never appears in any pre-guess response
- [ ] `leaderboard:vietnam` and `distance:vietnam` remain the country node's keys — pre-change totals unchanged and still growing
- [ ] `leaderboard:city:hn` / `:dn` / `:tphcm` / `:dl` / `:dh` totals are unchanged immediately after deploy
- [ ] `leaderboard:city:ld` equals `leaderboard:city:dl` and `leaderboard:city:la` equals `leaderboard:city:dh` immediately after migration
- [ ] The migration aborts if its export contains zero keys, and prints the resolved `KEY_PREFIX`
- [ ] `/game?location=HN` and `/game?location=DL` still work
- [ ] A leaf below the playability threshold is listed in the tree but not offered as playable
- [ ] 200 draws at `VN` hit at least four distinct provinces
- [ ] `npm test`, `npm run test:integration`, and `npm run build:check` pass
- [ ] No province's panorama index is re-fetched from Mapillary

## Red Team Review

### Session — 2026-08-30
**Reviewers:** 4 (Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic), Full verification tier
**Findings:** 38 raw → 15 after deduplication (15 accepted, 3 rejected)
**Severity breakdown:** 6 Critical, 7 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| C1 | `writeBarrel` emits invalid JS for hyphenated leaf codes | Critical | Accept | Phase 1 |
| C2 | `src/lib/mapillary.js` in no phase; discards the resolved leaf | Critical | Accept | Phase 2, 4 |
| C3 | Phase 1 cannot pass its own `npm test`; `CODES` derives from `CITIES` | Critical | Accept | Phase 1 |
| C4 | Migration export unbuildable: no scan primitive, `KEY_PREFIX` unaddressed | Critical | Accept | Phase 3 |
| C5 | `regions.js` + client import ships 25 MB of coordinates to the browser | Critical | Accept | Phase 1, 5 |
| C6 | `POST /api/new-game` leaks the resolved leaf; `getLeaderboard` takes unvalidated input into key names | Critical | Accept | Phase 4 |
| H1 | `/api/guess` non-idempotent; fan-out widens double-credit; "not half-recorded" claim false | High | Accept | Phase 3, 4 |
| H2 | Migration ordering undefined; copy≠replace; reconciliation would delete legacy points | High | Accept | Phase 3 |
| H3 | Both size budgets arithmetically wrong and self-contradictory | High | Accept | Phase 1, 2 |
| H4 | Generated centroids overwrite documented hand-picked centers | High | Accept | Phase 1 |
| H5 | `/api/regions` works around Phase 1's own decision; `plan.md` contradicted Phase 1 | High | Accept | Phase 1, 2, 4, 5 |
| H6 | Phase 5 accordion + grouped select absent under "no new dependencies" | High | Accept | Phase 5 |
| H7 | HN province union breaks panorama containment tests, no repair step | High | Accept | Phase 1, 2 |
| M1 | `build-pano-index.mjs` default list resurrects `dl.json`/`dh.json`; barrel double-counts | Medium | Accept | Phase 2 |
| M2 | `count > 0` too weak a playability gate; clustering measured | Medium | Accept | Phase 2 |
| — | Rate limiting on `/api/guess` | High | Reject | Pre-existing gap, unrequested scope |
| — | Redis round-trip count as blocking | Medium | Reject | Separable perf follow-up, same class as the declared out-of-scope `zIncrBy` race |
| — | Cu Chi as a defect | Critical | Reject | User accepted the gap; recorded in the coverage note instead |

**User decisions taken during adjudication:**
1. `VN` ships playable despite scoring zero — exploration mode, bands stay frozen.
2. Add `@radix-ui/react-accordion` and `@radix-ui/react-select` rather than hand-rolling or degrading to native controls.
3. Missing coverage (Cu Chi included) is acceptable; the coverage note carries it.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01` … `phase-06`
- Decision deltas checked: 18
- Reconciled stale references: 11 — `/api/regions` removed from Phase 4/5 and `plan.md` Architecture; `panos:` count field moved out of the tree into `counts.js`; `partialCoverage` widened from boolean to reason string; Goal 5 reworded from "zero new Mapillary requests" to "no province re-fetched"; Phase 1 Validation/Risk contradiction on `tests/pano-index.test.js` resolved; pano file rename moved from Phase 2 to Phase 1; size budgets restated in both phases; `session.regionCode` marked secret in Architecture and Phase 4; migration ordering pinned in `plan.md` Data flow and Phase 3; centroid overrides added to Key Decisions and Phase 1
- Unresolved contradictions: 0

## Open Questions

None. Seven decisions were resolved with the user:

1. **Bonus cases** — Lam Dong and Long An are a *partial-coverage label only*.
2. **Play level** — any node is playable, not leaf-only.
3. **New province leaderboards** — backfilled from their single child's totals.
4. **Legacy province points** — left on the parent, no synthetic child node.
5. **Duc Hoa's parent** — Long An, not Tay Ninh, per the pre-2025 basis.
6. **`VN` scoring zero** — accepted; ships as an exploration mode.
7. **Phase 5 primitives** — add the two Radix packages.

<!-- slug: nested-region-tree -->
