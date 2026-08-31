# Breaking-Change Recheck — working tree, 2026-08-31 21:17

Adversarial regression pass over the NEW deltas since
`plans/reports/code-reviewer-260831-1906-uiux-quick-wins.md`. Advisory only; no
code modified. Read the diff directly rather than the delegation summary.

Gates re-run here: `npx vitest run` → 242 passed / 15 files. `npx eslint .` →
0 errors, 16 warnings (same 16; `use-count-up.js:26` and `page.js:45` shown as
the tail). E2E and build not re-run per instruction.

Verdict: **no contract break, no data-loss path, no new trust-boundary leak.**
One real state-machine hole (H1), one product-level consequence worth an
explicit sign-off (M1), one client-bundle fact that changed (M3).

---

## Critical

None.

## High

### H1 — The 15s watchdog reopens the controls while a round fetch is still in flight, and `applyRound` has no generation guard

`GameClient.js:193-197` clears `roundLoading` unconditionally after 15s.
`GameClient.js:279-288` is still parked on `await prefetched` at that moment, and
`applyRound` (`GameClient.js:94-102`) applies whatever eventually resolves with
no check that it is still the round the user is waiting for.

Sequence:

1. Submit → `startPrefetch` (`:255`) issues `/api/new-game`; the fetch stalls
   (Neon cold start, Mapillary slow, mobile handover). No timeout anywhere.
2. Next Round → `roundLoading = true`, `sessionId = null`, awaiting the prefetch.
3. 15s → watchdog clears `roundLoading` → Skip (`:454`) and Retry (`:393`)
   re-enable.
4. User clicks Skip → `loadRound` → `applyRound(roundB)` → viewer shows B.
5. Prefetch resolves at t=20s → `handleNextRound` resumes → `applyRound(roundA)`
   → `sessionId`/`imageData`/`roundKey` all replaced by A.

Consequences: the panorama swaps under the player unprompted, round B's session
is orphaned for 30 minutes, and `applyRound`'s `setLoadError(null)` (`:101`)
silently dismisses the "Couldn't load a street view image" panel if step 4 had
failed. No scoring hazard — `applyRound` writes `sessionId` and `imageData` in
one batch, so the pair stays consistent and Submit is disabled anyway until a
fresh map click.

The same shape without the prefetch: watchdog fires while `handleSkipGuess`'s
`loadRound` is in flight (`:314`), user clicks Skip again, two `loadRound`s race,
last write wins, first session orphaned. The watchdog is the only thing that
opens this window — before it, every entry point was mutually excluded by
`roundLoading`.

Fix (one epoch counter, no new abstraction):

```js
const roundEpochRef = useRef(0);
// handleNextRound / handleSkipGuess / handleRetryLoad, before starting:
const epoch = ++roundEpochRef.current;
// applyRound and the loadError branch, before writing:
if (epoch !== roundEpochRef.current) return;
```

Then the watchdog only re-enables controls; it cannot let a stale round land.

## Medium

### M1 — Per-level ladders make the Vietnam board a rounds-played counter, and inflate new points against banked ones

Measured against the real generated bboxes:

| Board | 5 pts | 4 | 3 | 2 | 1 |
|---|---|---|---|---|---|
| `VN` (country) | ≤6,380 m | 12,759 | 25,519 | 63,797 | 127,593 |
| `TPHCM` | ≤442 m | 885 | 1,770 | 4,425 | 8,849 |
| `HN` | ≤594 m | 1,187 | 2,374 | 5,936 | 11,872 |
| `TPHCM-Q7` | ≤62 m | 123 | 247 | 617 | 1,234 |
| `HN-BADINH` | ≤50 m | 100 | 200 | 500 | 1,000 |

The old asymmetry is genuinely gone: `submitRoundScore` (`leaderboard.js:245-268`)
credits each board from the raw distance against that board's own bbox, so a
country round can no longer buy district points — `guess-route.test.js:140-172`
pins exactly that property. Accepted fix, correctly implemented.

The consequence to sign off on: **any** guess within 6.38 km now adds +5 to the
national board, whatever region was picked. A district player who lands within
6 km — which is almost every honest district guess — banks +5 nationally every
round. The Vietnam leaderboard stops measuring accuracy and starts measuring
volume, and it mixes with points banked under the old ladder where +5 needed
50 m. `docs/features.md:47-69` states the era mixing qualitatively ("Scores
earned before this change stay on the boards under the old absolute ladder") but
not that the country board is now effectively uncapped by skill.

This is a product decision, not a defect — flagging it for an explicit yes,
because it is a second-order effect of the accepted fix rather than something the
user approved directly. If it is unwanted, the lever is
`REFERENCE_DIAGONAL_METERS` (`game.js:39`) or a sub-linear factor
(`Math.sqrt`) in `bandsForDiagonal` (`game.js:46-52`); either is a one-line
change confined to `game.js`, and both are user decisions.

### M2 — `gameResult.score` keeps its name and shape but is now credited to no board

`guess/route.js:74` grades against the picked region; `:105` credits the boards
per level. The field is additive-compatible (shape unchanged), so this is not a
contract break, but its meaning changed from "the points added to every level"
to "a display-only grade". Three follow-ons:

- **Deploy skew, old cached client + new server:** an old bundle renders the
  headline score and `levels[].score` totals, and ignores the new `points`. It
  will show "3" for a round where the district board received 0, with no
  breakdown to explain it. Cosmetic, no crash — the new client is guarded
  (`GameClient.js:233` `submitted.bands ?? null`,
  `RoundResultDialog.js:172` `typeof entry.points === 'number'`).
- **New client, in-flight session from before the deploy:** covered.
  `session.pickedRegion ?? session.cityCode ?? null` for the ladder
  (`route.js:68`) and `session.regionCode ?? session.cityCode` for the fan-out
  (`route.js:83`); a legacy `cityCode` that is not a region code falls through
  `isRegion` to `SCORE_BANDS` rather than throwing.
- **District round whose panorama resolves elsewhere:** the pano is drawn from
  the picked district but the district is resolved by polygon, so a border pano
  can resolve to a neighbour or fall out to province level. Then the picked
  region is not in `ancestorsOf(scoringRegion)` and the headline score matches
  no credited board at all. Rare, cosmetic, worth one sentence in the docs if
  anyone asks.

### M3 — Turf now ships to the browser (the prior review's "fully tree-shaken" claim is stale)

`LeaderboardList.js:45-49` calls `bandsForBbox` → `calculateDistance`
(`game.js:3-18`) → `turf.point` / `turf.distance` from a `"use client"` module.
Verified in the current build (`.next/BUILD_ID` 20:46:06 postdates
`LeaderboardList.js` 20:45:01, so the artifact includes this delta):
`.next/static/chunks/02wfjqj_i3an0.js` contains both `Failed to calculate
distance` and `6371008.8`.

Cost is small — tree-shaking held (no `booleanPointInPolygon`, `convex`,
`voronoi`, `clustersKmeans` in any client chunk; the chunk is 28 KB raw). Report
it as a change of state, not a defect: the previous audited invariant "no turf in
the client bundle" is gone, and `@turf/turf`'s `sideEffects: false` is now
load-bearing for client payload size. If that matters, the two-line alternative
is a bbox-diagonal helper that does the equirectangular math inline for the
tint, leaving turf server-side.

## Low

- **L1 — `handleNextRound`'s re-entrancy guard reads state, not a ref.**
  `GameClient.js:270` `if (roundLoading) return`. Correct only because React
  flushes discrete click events between renders; two clicks dispatched inside one
  task both read `false` from the same closure. A ref (or the H1 epoch) is
  unconditional; `disabled={roundLoading}` on the dialog button is the cheaper
  version.
- **L2 — `creditScore` JSDoc drifted from its signature.** `leaderboard.js:134`
  still documents `@param {number} score`; the parameter is `points`
  (`:138`).
- **L3 — New comment is already wrong.** `tests/e2e/helpers.js:32-33` says "the
  viewer remounts on the URL"; it remounts on `roundKey`
  (`GameClient.js:405`, `key={roundKey}`). The per-round URL is still worth
  keeping — for realism and to exercise the image route — but not for the reason
  stated.
- **L4 — `submitRoundScore` is absent from the unknown-region table.**
  `tests/leaderboard.test.js:290-293` covers `submitScore`,
  `submitDistanceRecord`, `getLeaderboard`. `submitRoundScore` is the only
  fan-out entry point `/api/guess` actually calls and its `requireRegion` path
  is untested; one array row closes it.
- **L5 — The default distance board is now almost uniformly green.**
  `LeaderboardList.js:47` grades against the displayed board's ladder and
  `LeaderboardModal.js:19` opens on `COUNTRY_CODE`, where 5 points is ≤6.38 km.
  Consistent with how that board is credited (this is the fix for the prior
  L2), so intended — but the tint no longer discriminates on the tab users land
  on first.
- **L6 — `page.js` label cosmetics.** `label()` (`page.js:29`) trims only the
  exact `.00km`, so the first row now reads `0m-50m` (was `0-50m`) and a future
  2,500 m threshold would render `2.50km`. Inert for the current bands.
- **L7 — Pre-existing, not a regression: Skip's DEL/SET race.**
  `GameClient.js:298-303` fires `/api/skip` without awaiting, then reuses the
  same session id for the new round (`:314`). If the DEL lands after new-game's
  SET, the fresh round's session is gone and the next submit reads as
  "Round Not Recorded". Byte-identical ordering in the pre-change code; noted
  once so it is not rediscovered as new.
- **L8 — Pre-existing: the first round still has no spinner over the viewer.**
  `initialLoading` clears when `/api/new-game` returns
  (`GameClient.js:136`), not when the texture is up, and `roundLoading` is never
  raised for the initial load. Matches old behaviour; the `roundKey` and
  watchdog work does not touch this path.
- **L9 — The migration script grew a transitive turf dependency.**
  `scripts/lib/leaderboard-migration.mjs:14` → `leaderboard.js:11` →
  `game.js:1`. Verified it still imports cleanly under this Node
  (`BACKFILLS,PATTERNS,backfillPairs,copySortedSet,exportAll,findRegressions,restore,verifyTargets`)
  and `tests/migrate-leaderboards.test.js` passes. `@turf/turf` is a prod
  dependency, so no packaging risk.

---

## Round state machine — exhaustive walk (check b)

Every `setRoundLoading(true)` and its clearing paths:

| Entry | Line | Success clears via | Failure clears via | Stall clears via |
|---|---|---|---|---|
| `handleNextRound`, prefetch hit | `:277` → `:281` | `applyRound` bumps `roundKey` (`:100`) → viewer remounts (`:405`) → `ready` → `handlePanoramaReady` (`:180`) | prefetch rejects → `catch {}` → falls to `loadRound`; `if (!loaded) setRoundLoading(false)` (`:291`) | watchdog `:195` |
| `handleNextRound`, no prefetch | `:277` → `:290` | same remount → `ready` | `:291` | watchdog |
| `handleSkipGuess` | `:313` | same remount → `ready` | `:315` | watchdog |
| `handleRetryLoad` | `:320` | same remount → `ready` | `:322` | watchdog |

- **`roundKey` closes the M2 trap from the last review.** The viewer keys on
  `roundKey` (`:405`), not on the URL, and `PanoramaViewer`'s effect deps are
  `[imageUrl]` (`PanoramaViewer.js:97`) — so a repeated panorama URL still
  remounts and still fires `ready`. Without this, the ready-driven clear would
  have been a permanent dead state.
- **`panorama-error` also clears.** `PanoramaViewer.js:67-71` calls `onReady`
  before/alongside the fallback `<img>`, and the constructor's `catch`
  (`:72-77`) calls both `onReady` and `onError`. The only path that fires
  neither is the never-settling texture promise the file's own comment describes
  (`:22-25`) — which is exactly what the watchdog is for.
- **No permanently disabled Submit/Skip.** Submit is
  `!guessCoordinates || !imageData || submitting || roundLoading` (`:445`);
  `submitting` always clears at `:253` (outside the try/catch), `roundLoading`
  per the table, `imageData` is null only in the `loadError` state, which shows
  Retry + Back and lets Skip through (`:295` `if (!imageData && !loadError)`).
- **Prefetch consumed exactly once.** `prefetchRef.current` is read and nulled
  synchronously (`:275-276`), cleared on Skip (`:310`), and the abandoned
  promise has a detached `.catch` (`:216`) so it cannot surface as an unhandled
  rejection. Double-fetch on rapid Next Round: guarded, with the caveat in L1.
- **No stale state across rounds.** `resetRoundState` (`:261-265`) clears
  `mapExpanded`, `guessCoordinates`, `result` on both Next and Skip;
  `applyRound` clears `loadError`; `roundKey` guarantees a fresh viewer.
- **`initialLoading` untouched by `roundKey`/watchdog.** The watchdog is inert
  while `roundLoading` is false (`:194`), the initial path never raises it, and
  `initialLoading` clears in `finally` (`:136`). The `ready` from the first round
  hits a no-op `setRoundLoading(false)`.

## Contract audit (check a)

- **`/api/new-game`:** no diff. Response shape identical.
- **`/api/guess`:** additive only — `gameResult.bands` (`route.js:127`) and
  `levels[].points` (`leaderboard.js:158`). `distance`, `score`, `levels`,
  `distanceLevels`, `region`, `globalRank`, `cityRank`, `globalDistanceRank`,
  `cityDistanceRank`, `exactLocation`, `leaderboard`, `distance`, `message` all
  unchanged in name and type. `leaderboard.message` text changed
  (`+3` → `+3, +5, +5`); it is rendered, never parsed
  (`RoundResultDialog` via `leaderboardMessage`).
- **`submitScore`:** signature, semantics and message format preserved
  (`leaderboard.js:211-230`); it now delegates to `fanOutScore` with a constant
  `pointsFor`. Remaining callers: tests only (grep across `src`, `scripts`,
  `tests` — no production caller left). Keeping it is defensible as the flat
  primitive, but it is now dead production code; if nothing plans to use it,
  deleting it and its tests is the DRY call.
- **Redis keys and encodings:** `getRegionLeaderboardKey` /
  `getDistanceLeaderboardKey` untouched (`:51-64`), country still maps to
  `leaderboard:vietnam`, score boards still store an integer total keyed by the
  bare username (`creditScore:143`), distance entries still
  `username:distance:timestamp` (`:318`). `leaderboardKeys` export intact
  (`:69-72`).
- **Migration script:** consumes only `leaderboardKeys`; unaffected by the
  `fanOutScore` refactor. `tests/migrate-leaderboards.test.js` green, live
  import verified (L9).
- **`fanOutScore` semantics vs the old inline body:** identical —
  `Promise.all(ancestorsOf(regionCode).map(...))`, same `byLevel` aliases
  (`district`/`province`/`global`/`city`), same `success: true`. `pointsFor` is
  evaluated synchronously per level before its credit call, so no interleaving
  changed.
- **`submitRoundScore` failure mode:** `requireRegion` (`:252`) throws before any
  Redis write, and the route consumes the session at `:93` before calling it at
  `:105` — so an unknown region still loses the round with a 500. Identical to
  `submitScore`'s pre-existing behaviour; not worsened. `distance === undefined`
  (not falsy) preserves a legitimate 0 — pinned by
  `tests/leaderboard.test.js:268-271`. A non-numeric distance now yields 0
  points instead of pushing `NaN` into `zAdd`: a small improvement.

## Client-safety boundary (check d)

- No client module imports `lib/leaderboard.js` (only `api/guess`,
  `api/leaderboard`, `scripts`, tests) — so `leaderboard.js:11`'s new
  `game.js` import does not cross the boundary.
- `LeaderboardList.js` (client) → `lib/game.js` (→ `@turf/turf` only) and
  `lib/regions.js` (→ `data/regions/index.js`, `data/regions/counts.js`). No
  path to `pano-index`, `pano-db`, `data/panos`, or `data/boundaries`.
- `tests/regions.test.js:199-229` still meaningful: the walk from `regions.js`
  asserts the exact module set, and `:231-249` walks every `"use client"` file
  for the four forbidden path fragments. Both green in this run. Neither test
  says anything about *bundle size*, which is why M3 slipped past them.

## Anti-cheat re-check

Unchanged from the prior pass and re-verified against the new deltas:
`bands` derives from `session.pickedRegion` (`route.js:68-71`), a value the
player chose and whose bbox is already in the client bundle via `regions.js`;
`bandsForBbox` is a pure function of it. `levels[].points` is only emitted after
the atomic `deleteGameSession` claim (`:93`) and alongside `code`/`name`/`path`
that already reveal the resolved district. No new pre-guess signal.

## Metrics

- Tests: 242 passed / 15 files (`npx vitest run`).
- Lint: 0 errors, 16 warnings — all `react-hooks/set-state-in-effect`, matching
  the established localStorage/animation pattern; no new warning in this delta.
- Type coverage: n/a (JavaScript-only repo, no checker configured).

## Recommended actions

1. Add the epoch guard from H1 — the only defect that can put a stale round on
   screen.
2. Confirm M1 explicitly (country board = volume board) or turn the
   `REFERENCE_DIAGONAL_METERS` / sub-linear-factor lever. User decision.
3. Decide on M3: accept turf in the client bundle, or inline the diagonal math
   for the board tint.
4. Sweep L2-L4 (JSDoc param, stale e2e comment, `submitRoundScore` in the
   unknown-region table) — five minutes, all in touched files.
5. Decide whether `submitScore` earns its keep now that no production code calls
   it.

## Unresolved questions

1. M1: is the country board becoming a rounds-played counter acceptable, or
   should the scale factor be sub-linear?
2. M3: does turf in the client bundle matter enough to inline the tint's
   diagonal math?
3. Is `submitScore` retained for a planned caller, or is it dead code to remove?
