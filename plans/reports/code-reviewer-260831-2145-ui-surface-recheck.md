# Code Review — Remaining UI Surface + Test Integrity

Adversarial read-only recheck of the uncommitted working tree on `main`.

## Scope

- `src/app/page.js`, `src/app/components/RegionPicker.js`, `src/lib/last-region.js` (untracked)
- `src/app/components/LeafletMap.js`, `src/app/components/ResultMap.js`
- `src/app/components/LeaderboardList.js`, `src/app/components/LeaderboardModal.js`
- `tests/e2e/helpers.js`, `tests/e2e/game.spec.js`
- `docs/features.md`, `docs/game-flow.md`
- Cross-read for verification only: `src/lib/game.js`, `src/lib/leaderboard.js`,
  `src/lib/regions.js`, `src/app/api/guess/route.js`, `src/app/api/new-game/route.js`,
  `src/app/api/leaderboard/route.js`, `src/app/components/GameClient.js`,
  `src/app/components/RoundResultDialog.js`, `src/app/debug/**`,
  `tests/leaderboard.test.js`, `tests/guess-route.test.js`, `tests/game.test.js`

Checks run: `npx vitest run` → **15 files, 243 tests passing**. `npm run lint` → **0 errors,
16 warnings**. Build and e2e not run (declared green).

## Overall Assessment

No critical or breaking defect. Every claim in the task brief about mechanism was verified
against source; the one that did not hold is the *label* on the new scoring table, not its
derivation. The map-icon change is sound and the `Icon.Default` removal is safe. The real
weakness is test integrity: the e2e stub's new `bands`/`points` values are invented and
contradict their own comment, and two new unit assertions re-implement the production
formula rather than pinning it.

---

## Critical Issues

None.

---

## High Priority

### H1 — The new scoring table claims to describe "a district round"; it does not for 38 of 58 districts

`src/app/page.js:118-121`, `docs/features.md:47-48`, `docs/game-flow.md:55`

The caption reads *"For a district round — playing a whole province or the country widens
these distances to match its size."* and both docs call `SCORE_BANDS` the "district-round
base ladder". `bandsForDiagonal` (`src/lib/game.js:46-52`) floors the factor at a **10 km**
bbox diagonal, and most real districts are larger than that. Measured over the generated
tree:

```
playable districts with bbox: 58
at factor 1.00 (<=10km diagonal): 20
min HN-HOANKIEM 3906m (1.00) | median TPHCM-BINHTAN 15101m (1.51) | max TPHCM-CANGIO 47277m (4.73)
```

So a District 7 round actually grades on `62 / 123 / 247 / 617 / 1234` metres, not
`50 / 100 / 200 / 500 / 1000`. The table tells a player that 50 m earns 5 points in a
district round when the real threshold is 62 m in Q7 and 236 m in Can Gio. The whole point
of deriving the table from `SCORE_BANDS` was that a hardcoded copy drifts from what the
server awards — the derivation is right, the label reintroduces exactly that drift.

Fix — reword the caption and both docs to describe the reference, not a district:

```js
// src/app/page.js
<p className="mt-2 text-xs text-muted-foreground/80">
  For a compact area about 10km across — a larger district, a province, or the
  whole country widens these distances in proportion to its size.
</p>
```

and in `docs/features.md:47-48` / `docs/game-flow.md:55`, replace "the base ladder is for a
district round" with "the base ladder applies to any region up to a 10 km bbox diagonal;
everything larger scales up from it".

---

## Medium Priority

### M1 — The e2e stub's `bands` are fabricated and its comment asserts they are production values

`tests/e2e/helpers.js:50-62`, `:60-62`, `:81`

The comment says *"province-scaled, as the real route returns for a TPHCM pick"*. It is not.
Computed from the real code path (`bandsForBbox(getRegion('TPHCM').bbox)`):

| | stub | real TPHCM |
|---|---|---|
| bands (m) | 300, 600, 1200, 3000, 6000 | **442, 885, 1770, 4425, 8849** |
| `gameResult.score` at 123 m | 3 | **5** |
| `leaderboard.message` | `(+3, +5, +5)` | **`(+4, +5, +5)`** (Q7 = 62/123/247/617/1234 → 123 m = 4) |

A stub is allowed to be synthetic, but a stub that *claims* to mirror production and does
not is worse than an obviously fake one: the next maintainer will trust `≤1.20km = 3` as a
regression baseline for the TPHCM ladder, and it is not one.

Fix — either derive the fixture so it cannot drift:

```js
import { bandsForBbox, calculateScore } from '../../src/lib/game.js';
import { getRegion } from '../../src/lib/regions.js';
const BANDS = bandsForBbox(getRegion('TPHCM').bbox);
const SCORE = calculateScore(123, BANDS);
```
(and update the spec to assert `≤442m = 5`), or keep the invented numbers and change the
comment to say the payload is a synthetic ladder chosen to exercise the strip's
highlight branch, not a production capture.

### M2 — Phantom assertion: the new `submitRoundScore` test re-implements the code it tests

`tests/leaderboard.test.js:255-262`

```js
const expected = (code) => calculateScore(distance, bandsForBbox(getRegion(code).bbox));
for (const level of result.levels) expect(level.points).toBe(expected(level.code));
```

`expected()` is character-for-character the production expression at
`src/lib/leaderboard.js:255-257`. Change the reference diagonal, the band values, or the
bbox source and both sides move together — the test passes. Only the ordering check
(`expected('VN') > expected('TPHCM-Q7')`, which tests `game.js`) and the message format
carry information.

Fix — pin the literals. Verified against the current tree, 2200 m in `TPHCM-Q7` yields:

```js
expect(result.levels.map((l) => [l.code, l.points])).toEqual([
  ['TPHCM-Q7', 0], ['TPHCM', 2], ['VN', 5],
]);
expect((await getLeaderboard('VN'))[0].score).toBe(5);
```

The same shape appears at `tests/guess-route.test.js:148-150`
(`expect(body.gameResult.bands).toEqual(bandsForBbox(getRegion('TPHCM').bbox))`), but there
it is redeemed by the independent property assertions on the following lines
(`score > 0`, `calculateScore(distance) === 0`, `countryPoints > districtPoints`). Lower
priority, same recommendation.

### M3 — The per-round pano URL strengthens nothing; no assertion reads it

`tests/e2e/helpers.js:32-34`, `tests/e2e/game.spec.js:46-48`

The comment claims *"a fixed URL would let a broken next-round image swap pass unnoticed"*.
After the change, nothing in the suite reads the served URL, counts pano requests, or
inspects the viewer's texture source. `game.spec.js:48` only re-asserts the submit button is
disabled — which is `guessCoordinates === null`, unrelated to the image. A broken swap still
passes unnoticed; only the browser cache behaviour changed.

Fix — make the claim true, e.g. capture the URLs the pano route serves and assert two
distinct ones after Next Round:

```js
const served = [];
await page.route(`${PANO_IMAGE_URL}*`, async (route) => {
  served.push(route.request().url());
  await route.fulfill({ contentType: 'image/png', body: readFileSync(PANO_FIXTURE) });
});
// ... after Next Round:
await expect.poll(() => new Set(served).size).toBeGreaterThan(1);
```

### M4 — The new-game stub breaks the `sessionId` contract the real route implements

`tests/e2e/helpers.js:110-113` vs `src/app/api/new-game/route.js:14,52`

The real route reads `?sessionId=` and returns `sessionId || generateSessionId()` — the
client forwards the previous id (`GameClient.js:30-31`), so in production the session id is
**stable across rounds** and the pano URL is what changes. The stub ignores the parameter and
mints `e2e-session-${round}` on every call, then derives the image URL from it. Two
consequences: the stub's image-swap mechanism is keyed on something production holds
constant, and a regression where the client stops forwarding `sessionId` (burning a fresh
Redis session per round) cannot be caught.

Fix — echo the parameter, and key the image on the round counter instead:

```js
await page.route('**/api/new-game**', async (route) => {
  round += 1;
  const incoming = new URL(route.request().url()).searchParams.get('sessionId');
  await route.fulfill({ json: newGameResponse(incoming || `e2e-session-${round}`, round) });
});
```

### M5 — New user-visible behaviour is undocumented

`src/lib/last-region.js`, `src/app/components/RegionPicker.js:102-122`

The "Continue in &lt;region&gt;" row and the new `vngeoguessr_last_region` localStorage key
appear in neither `docs/features.md` nor `docs/game-flow.md` (whose section 1 already
documents the username localStorage read at `docs/game-flow.md:6`), and
`docs/project-structure.md` does not list `last-region.js`. That file's lib inventory at
`docs/project-structure.md:97` also still misattributes username storage to `game.js`
("Scoring, distance, formatting, username storage") — it lives in `src/lib/username.js`.

Fix — one line in the game-flow entry step, and add `last-region.js` (and `username.js`) to
the `src/lib` list while correcting the `game.js` description.

---

## Low Priority

- **L1** `src/app/page.js:27` — module-level `const label` is shadowed at `:102` by the
  `STEP_LABELS.map((label, i) => ...)` parameter. Harmless today (`SCORING_ROWS` is computed
  at module load), but two different `label`s in one 150-line file is a trap. Rename to
  `bandLabel`.
- **L2** `src/app/page.js:30` — the first row now renders `0m-50m = 5 pts` where it
  previously read `0-50m = 5 pts`. Cosmetic drift from the derivation; use `'0'` instead of
  `'0m'` if the old form was deliberate.
- **L3** `src/app/components/LeaderboardList.js:47-49` — `distanceBands` runs a Turf
  great-circle computation on **every** render, including score boards and the
  loading/empty early-returns at `:51` and `:67` where it is never read. Move it below the
  early returns and gate on `isDistance`, or wrap in `useMemo([regionCode])`.
- **L4** `src/lib/game.js:61` — `bandsForBbox(null)` returns the shared module-level
  `SCORE_BANDS` array *by identity* (pinned with `toBe` at `tests/game.test.js`). It is
  handed to client components and, on the server, held at module scope across every request.
  One accidental in-place mutation (`.sort()`, `.push()`) anywhere would corrupt scoring
  process-wide until restart. Recommend `export const SCORE_BANDS = Object.freeze(
  [...].map(Object.freeze));`.
- **L5** `src/app/components/GameClient.js:137-140` — `loadRound` returns `true` on the
  superseded-epoch path (`:114`), so `setLastRegion(code)` fires for a round that was
  discarded and never rendered. The comment says "Only a region that actually served a
  round". Return a distinct sentinel for the superseded case, or move the write into
  `applyRound`.
- **L6** `src/lib/last-region.js:8-14,19-23` — the try/catch is correct in isolation but buys
  no net resilience on the home page: `src/app/page.js:43` calls `getUsername()`
  (`src/lib/username.js:8`, unguarded) in the same effect pass, so a throwing `localStorage`
  still tears down the page. Either guard `username.js` the same way or drop the "blocked
  site data" justification from the comment.
- **L7** `src/app/components/RegionPicker.js:112` — adds a twelfth
  `react-hooks/set-state-in-effect` warning. Consistent with the eleven that already exist
  and genuinely required for the hydration-safe read; noted only so the count is on record
  (0 errors, 16 warnings total).
- **L8** `tests/e2e/helpers.js:88-101` — the leaderboard stub returns score-shaped rows
  (`{username, score, rank}`) regardless of `?type=`. The new `regionCode`-driven distance
  colouring therefore has zero coverage in any suite; a distance row would render
  `formatDistance(undefined)` → `"NaNkm"` (no crash, verified by reading
  `src/lib/game.js:73-79`).
- **L9** `docs/game-flow.md:63-64` — "multiplies every threshold by the picked region's bbox
  diagonal over a 10km reference" omits the `Math.max(1, ...)` floor
  (`src/lib/game.js:47`). As written, Hoan Kiem (3.9 km diagonal) would shrink the ladder to
  ~40 % — it does not.

---

## Verified Sound (task questions answered)

**1. Hydration & SSR.** `SCORING_ROWS` (`page.js:28-35`) is module-scope, derived from a
static const, and contains no `Date`/`Math.random`/`window` — server and client prerender
produce identical strings. `RegionPicker` uses `useState(null)` + `useEffect`
(`:107-114`), so the server-rendered tree and the first client render both omit the row; no
mismatch. `last-region.js` guards `typeof window` **and** wraps both `getItem` and `setItem`
in try/catch, which covers the Chrome "blocked site data" case where touching
`localStorage` throws on property access.

**2. LeafletMap / ResultMap.** `imageUrl()` (`LeafletMap.js:14`) is sound for both shapes,
and the production build already emits the assets — `.next/static/media/` contains
`marker-icon.*.png`, `marker-icon-2x.*.png`, `marker-shadow.*.png`. Removing the
`Icon.Default` block from `ResultMap` is safe: every marker on that map is a `divIcon`
(`ResultMap.js:43-48` red, `:56-61` green) and the third layer is an `L.polyline` (`:68`),
which needs no icon. No `cdnjs`/`unpkg` URL remains anywhere in `src/` (only Mapillary Graph
API, Photon, and OSM tiles). The one remaining default-icon marker,
`src/app/debug/page.js:145`, is added onto a map created by `LeafletMap`, so it now gets the
bundled icons — a net improvement. `src/app/debug/coverage/CoverageMap.js` uses
`L.circleMarker` only.

**3. LeaderboardList.** The only render site is `LeaderboardModal.js:135`; no test or other
component constructs it, so there is no stale prop shape. `regionCode` undefined →
`isRegion(undefined)` is false → `bandsForBbox(null)` → base ladder, identical to the
pre-change behaviour. `getScoreColor` (`:24-31`) is byte-identical to before — score-board
thresholds unchanged. `getRegion(regionCode).bbox` cannot throw: `isRegion` guards it, and a
region without a bbox falls through to the base ladder, matching what
`submitRoundScore` credits. All 58 playable district names are unique across the tree, so
"Continue in District 7" is unambiguous.

**4. Playwright glob.** `${PANO_IMAGE_URL}*` still matches the per-round URL. Traced through
playwright-core 1.62.1: `resolveGlobBase` tokenises the last path segment (no `?` in the
*pattern*, so no query split), and `globToRegexPattern` compiles a single `*` to `([^/]*)`,
giving `^https://pano\.invalid/e2e-round\.png([^/]*)$`. The tail `?session=e2e-session-1`
contains no `/`, so it matches. No fix needed.

**5. e2e assertions.** `getByText('123m away', { exact: true })` **narrows** the previous
matcher (the sr-only description at `RoundResultDialog.js:79` reads "Scored 3 of 5 points,
123m away." and no longer collides) — a strengthening. `'Score added at 3 levels
(+3, +5, +5)'` matches the real format string at `src/lib/leaderboard.js:260-262`
field-for-field. `getByText('District 7', { exact: true })` still resolves to exactly one
node (the path row is not exact, the distance row reads "District 7 distance"). Response
*shapes* — `gameResult.{distance,score,bands,levels,distanceLevels,region,globalRank,
cityRank,globalDistanceRank,cityDistanceRank,exactLocation}`, level entries
`{code,name,username,points,score,rank,trimmed}` — match `guess/route.js:120-147` and
`leaderboard.js:153-162` exactly. Only the *values* diverge (M1) and the stubbed
`leaderboard`/`distance` objects are trimmed to `{message}` (harmless: `GameClient.js:248`
reads only `.message`).

**6. Docs claims fact-checked.** `bandsForBbox` exists in `src/lib/game.js:60`;
`REFERENCE_DIAGONAL_METERS = 10_000` at `:39`; `gameResult.bands` returned at
`guess/route.js:127` and rendered at `RoundResultDialog.js:121-145`;
`submitRoundScore` in `src/lib/leaderboard.js:245`; `points` on each level at
`leaderboard.js:157`. The worked example in `docs/features.md:65-67` ("a 2km miss on a
country round earns country points on the Vietnam board and nothing on the district board")
checks out: 2000 m → 0 on Q7 (`≤1234`), 5 on VN (`≤6380`). Only the "district round" framing
(H1) and the missing floor (L9) are wrong.

---

## Metrics

- Type coverage: n/a (JavaScript-only project, per `CLAUDE.md`)
- Unit tests: 243 passing / 15 files (`npx vitest run`, 3.2 s)
- Lint: 0 errors, 16 warnings (`npm run lint`); 1 warning newly introduced (L7)
- New/changed LOC in scope: ~130 added, ~20 removed across 11 files

---

## Recommended Actions

1. **H1** Reword the home-page caption and both docs' "district round" framing to describe
   the 10 km reference. (user-visible correctness)
2. **M1** Make the e2e band fixture derive from `bandsForBbox('TPHCM')`, or retract the
   "as the real route returns" comment.
3. **M2** Replace the self-referential `expected()` assertions in
   `tests/leaderboard.test.js:255-262` with the literals `[0, 2, 5]`.
4. **M3/M4** Either assert the per-round pano URL actually changes and echo `sessionId` in
   the stub, or revert both stub edits — as landed they add divergence without coverage.
5. **M5** Document the "Continue in &lt;region&gt;" row and `last-region.js`; fix the
   `game.js` description in `docs/project-structure.md:97`.
6. **L3/L4** Cheap hardening: memoize `distanceBands`, freeze `SCORE_BANDS`.

## Unresolved Questions

1. Was the e2e `bands` fixture deliberately kept round-numbered for readability, or was it
   believed to be a production capture? The answer decides between "fix the numbers" and
   "fix the comment" in M1.
2. `submitScore` (`src/lib/leaderboard.js:211`) now has **no production caller** — only
   ~25 assertions in `tests/leaderboard.test.js`. The bulk of leaderboard coverage therefore
   exercises a path the routes no longer take. Is the flat primitive still wanted, or should
   those tests migrate to `submitRoundScore`?
3. `getScoreColor`'s absolute thresholds (5/10/15/25/50) predate per-level scoring. With the
   country board now paying 5 points for nearly any in-country guess, national totals
   saturate to purple far faster than before. Intentional, or worth recalibrating?
