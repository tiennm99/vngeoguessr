# Research Report: Mapillary Coverage — Which Cities/Districts to Add Next

Conducted 2026-09-04 11:59 (+07). Method: direct probe of the Mapillary z14
vector tile API with the token in `.env`, counted inside real OSM boundaries.
No web search — coverage is a measurable fact, not a documented one.

## Executive Summary

**Add Dong Nai first.** Bien Hoa alone holds ~29,700 distinct 33m locations
across 153 cells — second only to Thu Duc (41,338) among everything already in
the game, and larger than every Hanoi district. Its neighbours Nhon Trach
(6,202), Vinh Cuu (1,377+), Long Thanh (1,341), Trang Bom (490) and Thong Nhat
(448) make Dong Nai a complete six-district province, ~39,500 locations, for
~610 tile requests.

**Then Binh Duong** (Di An 5,663 / Thu Dau Mot 3,554 / Ben Cat 3,389 / Thuan An
3,005 ≈ 15,600 locations in ~70 tiles — the cheapest coverage per request found)
**and two more Long An districts** (Ben Luc 4,277, Can Giuoc 4,203), which need
no new province node since LA already exists and is flagged
`partialCoverage: 'one town covered'`.

**Do not bother with**: Can Tho, Vinh, Thai Nguyen, Lao Cai, Quy Nhon, Ca Mau,
Phu Quoc, Ha Long, Tan An — all measured **zero** panoramas. Nha Trang (4
locations) and Phan Thiet (9, median capture 2019) are effectively zero too.
Vietnam's Mapillary pano coverage does not follow population; it follows a
handful of contributors around the HCMC industrial belt, Thanh Hoa and the
Mekong.

All 32 recommended queries resolve to a `class=boundary` OSM **relation**, which
is what `scripts/build-region-boundaries.mjs` requires — so nothing here is
blocked on an unresolvable boundary.

## Method

- Same source and filter as `scripts/build-pano-index.mjs`: z14
  `mly1_public` tiles, `image` layer, `is_pano` only.
- Points counted only inside the OSM polygon (turf point-in-polygon), the same
  polygon `build-region-boundaries.mjs` would fetch.
- **locations** = distinct 0.0003° (~33m) cells = what the index would actually
  store. **cells** = distinct 0.01° (~1.1km) cells = the `counts.js` metric that
  drives `playable`/`thin` (`MIN_PANOS 3`, `MIN_CELLS 3`, `THIN_CELLS 10`).
- Areas over 150 tiles were stride-sampled; those rows are marked and scaled.
- ~5,600 tile requests spent of the 50,000/day budget.

**Controls (method validation)** — probe vs. what the shipped index holds:

| Region | Probe locations | `counts.js` panos | Probe cells | `counts.js` cells |
|---|---|---|---|---|
| Duc Hoa (LA) | 11,721 | 11,717 | 107 | 106 |
| Hai Chau (DN) | 176 | 172 | 5 | 5 |

Within 0.04%. The numbers below are directly comparable to `counts.js`.

## Ranked Candidates

Playable = `panos >= 3 && cells >= 3`. Thin = fewer than 10 cells.

| Rank | Region | Locations (~33m) | Cells | Median capture | Tiles to build | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Bien Hoa** (Dong Nai) | 29,667 | 153 | 2024 | 67 | strong |
| 2 | **Nhon Trach** (Dong Nai) | 6,202 | 61 | 2025 | 33 | strong |
| 3 | **Di An** (Binh Duong) | 5,663 | 30 | 2024 | 11 | strong |
| 4 | **Rach Gia** (Kien Giang) | 4,763 | 42 | 2024 | 34 | strong |
| 5 | **Ben Luc** (Long An) | 4,277 | 49 | 2024 | 76 | strong |
| 6 | **Can Giuoc** (Long An) | 4,203 | 44 | 2024 | 21 | strong |
| 7 | **Thu Dau Mot** (Binh Duong) | 3,554 | 20 | 2024 | 12 | strong |
| 8 | **Ben Cat** (Binh Duong) | 3,389 | 20 | 2016 | 38 | strong, but dated |
| 9 | **Thuan An** (Binh Duong) | 3,005 | 23 | 2024 | 9 | strong |
| 10 | **Thanh Hoa city** | 2,935 | 73 | 2025 | 63 | strong |
| 11 | **Hoi An** (Quang Nam) | 1,485 | 23 | 2026 | 33 | strong, freshest |
| 12 | **Viet Tri** (Phu Tho) | 1,407 | 33 | 2025 | 41 | strong |
| 13 | **Vinh Cuu** (Dong Nai) | 1,377 sampled, est. 5,400 | 54 | 2024 | 251 | strong |
| 14 | **Long Thanh** (Dong Nai) | 1,341 | 36 | 2025 | 102 | strong |
| 15 | **Vung Tau** | 922 | 17 | 2024 | 9 | good (undercount, see caveats) |
| 16 | **Ninh Binh** | 848 | 26 | 2024 | 20 | good |
| 17 | **Long Xuyen** (An Giang) | 847 | 32 | 2026 | 33 | good |
| 18 | **My Tho** (Tien Giang) | 820 | 34 | 2024 | 26 | good |
| 19 | **Duong Kinh** (Hai Phong) | 664 | 13 | 2024 | 13 | good |
| 20 | **Thuy Nguyen** (Hai Phong) | 629 | 18 | 2024 | 20 | good |
| 21 | **Chau Doc** (An Giang) | 589 | 29 | 2024 | 34 | good |
| 22 | **Vinh Long city** | 587 | 25 | 2024 | 19 | good |
| 23 | **Trang Bom** (Dong Nai) | 490 | 17 | 2024 | 82 | good |
| 24 | **Thong Nhat** (Dong Nai) | 448 | 14 | 2024 | 71 | good |
| 25 | **Sam Son** (Thanh Hoa) | 438 | 9 | 2025 | 21 | playable, thin |
| 26 | **Bac Ninh city** | 393 | 14 | 2025 | 29 | good |
| 27 | **Le Chan** (Hai Phong) | 320 | 8 | 2024 | 4 | playable, thin |
| 28 | **Buon Ma Thuot** (Dak Lak) | 293 | 19 | 2025 | 97 | good |
| 29 | **Quang Xuong** (Thanh Hoa) | 249 | 7 | 2025 | 53 | playable, thin |
| 30 | **Hai An** (Hai Phong) | 180 | 10 | 2024 | 15 | playable |
| 31 | **Pleiku** (Gia Lai) | 155 | 15 | 2025 | 75 | playable |
| 32 | **Hoang Hoa** (Thanh Hoa) | 149 | 5 | 2025 | 15 | playable, thin |
| 33 | **Dong Hoi** (Quang Binh) | 128 | 4 | 2023 | 50 | playable, thin |
| 34 | **Long Khanh** (Dong Nai) | 73 | 2 | 2024 | 57 | NOT playable (cells < 3) |
| 35 | **Hong Bang** (Hai Phong) | 62 | 2 | 2024 | 9 | NOT playable (cells < 3) |

For scale: `DN-HAICHAU` ships with 172 locations / 5 cells and is playable, so
everything down to rank 33 is already better than a district in the live game.

### Zero coverage — skip

Can Tho (incl. its Ninh Kieu core), Vinh, Thai Nguyen city, Lao Cai city, Quy
Nhon, Ca Mau, Phu Quoc, Ha Long, Bim Son, Tan An (Long An), Kien An and An Duong
(Hai Phong), Hue's Phu Xuan core. Nha Trang: 4 locations. Phan Thiet: 9, median
2019.

Province-wide sampled probes suggest scattered rural coverage exists in Nam Dinh
(est. 9,600), Hai Phong overall (est. 8,500), Bac Giang (est. 2,300) and Hue
(est. 2,300), but it is spread over thousands of km² of countryside — poor
guessing material and expensive to index. Not recommended.

## Recommended Rollout

### Phase 1 — Dong Nai (new province, ~39,500 locations, ~610 tiles)

Add to `REGIONS` in `scripts/build-region-boundaries.mjs`:

```js
  // -- Dong Nai -------------------------------------------------------------
  DNA: { name: 'Dong Nai', level: 'province', parent: 'VN', center: [10.9447, 106.8243] },
  'DNA-BIENHOA':   { name: 'Bien Hoa',   level: 'district', parent: 'DNA', query: 'Thành phố Biên Hòa, Đồng Nai, Việt Nam' },
  'DNA-NHONTRACH': { name: 'Nhon Trach', level: 'district', parent: 'DNA', query: 'Nhơn Trạch, Đồng Nai, Việt Nam' },
  'DNA-LONGTHANH': { name: 'Long Thanh', level: 'district', parent: 'DNA', query: 'Long Thành, Đồng Nai, Việt Nam' },
  'DNA-TRANGBOM':  { name: 'Trang Bom',  level: 'district', parent: 'DNA', query: 'Trảng Bom, Đồng Nai, Việt Nam' },
  'DNA-VINHCUU':   { name: 'Vinh Cuu',   level: 'district', parent: 'DNA', query: 'Vĩnh Cửu, Đồng Nai, Việt Nam' },
  'DNA-THONGNHAT': { name: 'Thong Nhat', level: 'district', parent: 'DNA', query: 'Thống Nhất, Đồng Nai, Việt Nam' },
```

Code `DN` is taken by Da Nang — hence `DNA`. Skip Long Khanh (2 cells, not
playable).

### Phase 2 — Binh Duong (new province, ~15,600 locations, ~70 tiles)

Best coverage-per-request in the whole survey.

```js
  BD: { name: 'Binh Duong', level: 'province', parent: 'VN', center: [10.9804, 106.6519] },
  'BD-DIAN':      { name: 'Di An',       level: 'district', parent: 'BD', query: 'Dĩ An, Việt Nam' },
  'BD-THUANAN':   { name: 'Thuan An',    level: 'district', parent: 'BD', query: 'Thuận An, Việt Nam' },
  'BD-THUDAUMOT': { name: 'Thu Dau Mot', level: 'district', parent: 'BD', query: 'Thủ Dầu Một, Việt Nam' },
  'BD-BENCAT':    { name: 'Ben Cat',     level: 'district', parent: 'BD', query: 'Bến Cát, Việt Nam' },
```

Ben Cat's median capture is 2016 — decade-old imagery guesses worse. Include it,
or drop it and keep three fresh districts.

### Phase 3 — extend Long An (~8,500 locations, ~97 tiles)

`LA` already exists with one leaf. Add two, and drop its
`partialCoverage: 'one town covered'` note:

```js
  'LA-BENLUC':   { name: 'Ben Luc',   level: 'district', parent: 'LA', query: 'Bến Lức, Việt Nam' },
  'LA-CANGIUOC': { name: 'Can Giuoc', level: 'district', parent: 'LA', query: 'Cần Giuộc, Việt Nam' },
```

Existing leaf `DH` keeps its bare code for leaderboard-key compatibility; new
leaves should use the prefixed form.

### Phase 4 — single-city provinces, cheap and fresh

Same shape as the existing `LD`/`DL` one-town pattern. In value order: Rach Gia
(Kien Giang, 4,763), Thanh Hoa city + Sam Son (2,935 + 438), Hoi An (1,485,
median 2026 — the freshest imagery found), Viet Tri (1,407), Ninh Binh (848),
Long Xuyen + Chau Doc (An Giang, 1,436 together), My Tho (820), Vung Tau (922),
Vinh Long (587), Bac Ninh (393), Buon Ma Thuot (293).

### Build sequence (unchanged)

```
node scripts/build-region-boundaries.mjs DNA BD LA
node scripts/build-pano-index.mjs DNA BD LA
node scripts/assign-pano-districts.mjs
npm run data:seed
npm test
```

Phases 1-3 together cost ~780 tile requests, ~1.5% of the daily budget, and add
~63,600 locations to an index that currently holds 424,617 — a 15% increase.

## Caveats

- Several boundaries resolved to a smaller polygon than the pre-2025 district
  (Thu Dau Mot 16km² vs ~118, Thuan An 16 vs ~84, Di An 21 vs ~60, Nhon Trach
  109 vs ~410, Vung Tau 15 vs ~141, Can Giuoc 61 vs ~210). Those counts are
  **undercounts**; the real build will find the same or more.
- The probe took the first polygon match; `build-region-boundaries.mjs` takes
  the first `class=boundary` match. All 32 recommended queries have such a match
  (verified), but for the undercounted rows above the polygon may differ
  slightly from what was measured.
- Sampled rows (Vinh Cuu, and the province-wide screens) are estimates scaled by
  tiles fetched vs tiles in area; density is not uniform, so treat them as
  order-of-magnitude.
- Vietnam's 2025 merger deleted many city relations from OSM. Bare-name queries
  (`Dĩ An, Việt Nam`) hit `boundary/historic` relations where the
  `Thành phố ...` form now misses entirely. That is why several first-round
  probes falsely reported zero.
- Scratch probe scripts live in the gitignored `data-build/probe/`; nothing in
  `src/` or `scripts/` was touched.

## Unresolved Questions

1. Ben Cat's imagery is from 2016 — is decade-old streetscape acceptable, or
   should a median-capture floor (say 2020) gate what gets added?
2. Bien Hoa at ~29,700 locations would be the second-largest region in the game.
   Is one dominant district fine, or should the picker weight regions?
3. New leaf codes: prefixed (`LA-BENLUC`) or bare (`DH` style)? Existing bare
   codes exist only for leaderboard-key compatibility; confirm before adding.
4. `DN-CAMLE` and `DN-HOAVANG` still read 0 panos, and `TPHCM-CUCHI` has no OSM
   relation. Re-check them in the same pass, or leave as is?
