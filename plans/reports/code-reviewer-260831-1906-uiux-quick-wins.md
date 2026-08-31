# Code Review — UI/UX Quick Wins (working tree, 2026-08-31)

Scope: `git diff` (13 files) + untracked `src/lib/last-region.js`. ~396 insertions.
Plan: `plans/260831-1906-uiux-quick-wins/plan.md`. Advisory only; no code modified.

Gates re-run: `npx vitest run` 240/240 (15 files); `npx eslint .` 0 errors / 16
warnings. E2E and build not re-run per instruction; build artifacts in `.next`
were inspected and are current (contain this diff's strings).

## Overall

The state split, error panel, prefetch and last-region work is coherent and the
round state machine survives the walk: no dead loading states, no stale-state
leak between rounds, no double-submit, no scoring hazard from session-id reuse.
Two substantive issues: a leaderboard fairness regression created by scoring
against the picked region while still crediting the resolved district, and a
new response field plus a new UI block that no test exercises.

---

## High

### H1 — Region-relative scoring credits district boards with country-scale scores

`src/app/api/guess/route.js:68-74` derives the ladder from the **picked**
region. `src/lib/leaderboard.js:187` (`submitScore`) still fans that score out
to the **resolved** district, its province and the country
(`ancestorsOf(regionCode)` where `regionCode = session.regionCode`).

Measured against the real generated bboxes:

| Board credited | 5 pts if you picked that district | 5 pts if you picked Vietnam |
|---|---|---|
| `leaderboard:city:tphcm-q7` | ≤ 62 m | ≤ 6,380 m (~100x) |
| `leaderboard:city:tphcm` | ≤ 442 m | ≤ 6,380 m (~14x) |

The cheapest route to the top of any district board is now to play the country
round repeatedly and let the fan-out credit whatever district you land in. This
also holds district-to-district on a province board: `DN-HOAVANG` gets 273 m for
5 points, `HN-BADINH` gets 50 m (factor clamps at 1).

The plan's accepted risk reads "score semantics change for province/country
rounds (accepted; boards mix eras)" — that covers old-vs-new scores over time,
not this permanent per-round asymmetry within the new scheme. Treating it as
covered would be reading more into the user's acceptance than it says.

Options (user decision — do not pick silently):

- **(a) Per-level ladders.** Score each credited level against that level's own
  bbox inside the existing fan-out. `submitScore` already iterates
  `ancestorsOf(regionCode)`; pass a scorer instead of a number:
  ```js
  // leaderboard.js
  export async function submitScore(username, scoreFor, regionCode) { // scoreFor(code) -> 0..5
    const levels = await Promise.all(
      ancestorsOf(regionCode).map((code) => creditScore(h, code, scoreFor(code), trimmedUsername))
    );
  ```
  with `scoreFor = (code) => calculateScore(distance, bandsForBbox(getRegion(code).bbox))`
  in the route. Each board then means "how good was this guess for this region".
  Note this changes the country board's meaning too.
- **(b) Display only.** Return `bands` and show the scaled ladder in the reveal,
  but credit the boards with `SCORE_BANDS`. Keeps boards untouched; the reveal
  then shows a score that does not match what the board got, so `gameResult.score`
  would need splitting into `displayScore` / `boardScore`.
- **(c) Accept and document.** Add the asymmetry to `docs/features.md` explicitly
  so it is a stated rule rather than an emergent one.

## Medium-High

### H2 — New `bands` contract not reflected in the e2e stub; band chips untested

`tests/e2e/helpers.js:36-68` `guessResponse()` returns no `bands`.
`src/app/components/RoundResultDialog.js:121` gates the entire band strip on
`Array.isArray(result.bands) && result.bands.length > 0`, so the new UI block
renders in zero tests. This repo has no component tests, so e2e is the only
place it could be proven.

The helper's own header (lines 6-7) states: "The stub payloads mirror the real
route response shapes; a contract change should be made in the route tests
first, then reflected here." The route test was added
(`tests/guess-route.test.js:140`); the stub was not updated.

Fix:
```js
// tests/e2e/helpers.js, inside gameResult
bands: [
  { maxMeters: 442, points: 5 }, { maxMeters: 885, points: 4 },
  { maxMeters: 1770, points: 3 }, { maxMeters: 4425, points: 2 },
  { maxMeters: 8849, points: 1 },
],
```
```js
// tests/e2e/game.spec.js
await expect(dialog.getByText('≤442m = 5')).toBeVisible();
await expect(dialog.getByText('beyond = 0')).toBeVisible();
```

Related phantom coverage in the same file: `newGameResponse()` hands out the
same `PANO_IMAGE_URL` for every round, so after Next Round `imageData.url` is
unchanged, `PanoramaViewer`'s `key` does not change, and the viewer never
remounts. The "next round loads a fresh round" assertion therefore passes
without a new panorama ever mounting. Give round 2 a distinct URL and stub it.

## Medium

### M1 — `handleNextRound` has no re-entrancy guard; the dialog stays clickable for 200 ms

`src/app/components/GameClient.js:251`. `src/components/ui/dialog.jsx`
`DialogContent` carries `data-[state=closed]:animate-out ... duration-200`, so
Radix Presence keeps the content mounted and interactive through the close
animation. A double-click fires `handleNextRound` twice; the second call finds
`prefetchRef.current === null` (nulled at line 257) and issues a second
`/api/new-game`, creating a second server session.

Not a scoring hazard — `applyRound` (line 89) sets `sessionId` and `imageData`
together, so whichever promise resolves last leaves a consistent pair. Cost is
a wasted Neon/Mapillary round trip plus a wasted Redis session per double-click,
and a non-deterministic choice of panorama.

Fix: guard with a ref, or pass `roundLoading` into `RoundResultDialog` and set
`disabled={roundLoading}` on Next Round.

### M2 — Between-rounds spinner clears before the panorama is visible; `handlePanoramaReady` is now dead

`GameClient.js:262, 271, 295, 302` all call `setRoundLoading(false)` as soon as
`/api/new-game` returns. `applyRound` swaps `imageData.url` in the same batch,
remounting `PanoramaViewer` (`key={imageData.url}`), which renders a bare black
container with no indicator until PSV fires `ready`. `handlePanoramaReady`
(line 174) consequently has nothing left to clear.

This matches pre-change behaviour (the old `getRandomImage` also cleared
`loading` on data arrival), so it is not a regression — but it undercuts the
stated goal of the split, which was for the spinner to cover the transition.

If you want ready-driven clearing, clear only on the failure path:
```js
const ok = await loadRound(location, currentSession);
if (!ok) setRoundLoading(false);   // success: handlePanoramaReady/Error clears it
```
**Trap if you do:** when the next round returns the same `imageData.url`, the
`key` does not change, the viewer does not remount, `onReady` never fires again,
and `roundLoading` sticks true forever with Submit and Skip both disabled — a
real dead state. Key the viewer on a per-round token (`sessionId`, or a counter)
rather than the URL before making this change.

### M3 — `role="status"` inside a subtree that mounts all at once is not reliably announced

`src/app/components/RoundResultDialog.js:97-99`. A live region inserted together
with its content is generally not announced — the AT observes the region
appearing, not a change inside an existing region — and
`DialogContent key={open ? 'open' : 'closed'}` (line 60) guarantees a full
remount every time. The comment at lines 94-96 claims screen readers get the
numbers once; that is not dependable.

The dialog's `aria-describedby` → `DialogDescription` **is** announced on open.
Fold the outcome into it and drop the separate paragraph — DRY, and it removes
the text collision that forced `exact: true` at `tests/e2e/game.spec.js:37`:

```jsx
<DialogDescription className="sr-only">
  {result?.failed
    ? 'The guess could not be saved and nothing was scored.'
    : `Scored ${score} of 5 points, ${formatDistance(result.distance)} away.`}
</DialogDescription>
```

## Low

### L1 — Home scoring table now reads "500m-1.00km = 1 pt" / "1.00km+ = 0 pts"

`src/app/page.js:27-33`. `formatDistance(1000)` returns `'1.00km'`; the replaced
hardcoded copy said `1km`. Deriving from `SCORE_BANDS` is right; `formatDistance`
is a measured-distance formatter, not a threshold formatter. Add a local
`threshold(m)` that trims trailing zeros if the cosmetic change matters.

### L2 — Distance-board colours still use the district ladder

`src/app/components/LeaderboardList.js:18` calls `calculateScore(distance)` with
the default bands to pick a colour. Now that the awarded score depends on the
picked region, that colour corresponds to no score anyone earned: a country-round
3 km entry renders in the 0-point colour while it actually scored 4. The board
stores no record of which ladder applied, so this cannot be fixed locally.
Either accept it as a purely absolute "accuracy" scale, or drop the colouring.

Either way, the comment at `src/lib/game.js:20-22` ("anything that bands a result
(colors, labels, the scoring table) should derive from calculateScore") now
overstates the invariant — there is no longer one ladder. Worth correcting since
that comment is the reason a future change will trust it.

### L3 — `bandsForBbox` has no finite-value guard (currently unreachable)

`src/lib/game.js:59-63`. A malformed bbox yields `NaN` thresholds, and
`calculateScore` then scores every round 0 silently rather than failing.
Verified unreachable today: of 67 regions exactly one (`TPHCM-CUCHI`) has no
bbox and it is not playable, so no playable region reaches the `SCORE_BANDS`
fallback. A `Number.isFinite(diagonal)` check would make this fail-safe rather
than fail-silent if a future boundary rebuild drops a bbox.

### L4 — One new lint warning

`src/app/components/RegionPicker.js:112` adds a 16th
`react-hooks/set-state-in-effect` warning. It matches the established local
pattern (`ThemeToggle.js:20`, `page.js:43`, `MapSearchBox.js:42`), and reading
localStorage in an effect is the correct call to avoid a hydration mismatch.
Noted only because a new warning is normally a signal in this repo.

---

## Verified clean

- **Anti-cheat.** `bands` derives from `session.pickedRegion ?? session.cityCode`
  (`guess/route.js:68`) — the region the player chose and already knows, whose
  bbox is already in the client bundle via `regions.js`. `bandsForBbox` is a pure
  function of that bbox, so the client can invert nothing about the resolved
  district from it. `session.regionCode` still reaches the client only as
  `publicRegion(scoringRegion)` after the session is atomically consumed
  (`route.js:93`). No new leak, no cheaper extraction path.
- **Contracts.** `/api/guess` gained `gameResult.bands` only; `/api/new-game`
  unchanged. `calculateScore(distance)` default preserves the old ladder, and the
  one other caller (`LeaderboardList.js:18`) is unaffected. Leaderboard keys and
  the 0-5 integer scale untouched: `bandsForDiagonal` passes `points` through and
  `factor >= 1`, so the ladder stays strictly ascending and rounding never
  collapses two thresholds.
- **Client-safety boundary.** `last-region.js` imports nothing; `game.js` imports
  only `@turf/turf`. Neither `pano-index` nor `pano-db` is reachable from client
  code. Bundle checked in `.next/static/chunks`: turf is fully tree-shaken
  (`@turf/turf` declares `sideEffects: false`; no client chunk contains
  `booleanPointInPolygon`, `earthRadius`, or `Failed to calculate distance`), so
  the new `page.js → lib/game` import costs no client bytes.
- **Leaflet icons.** Build output confirms the static import resolves to a bare
  URL string under this bundler (`e.q("/_next/static/media/marker-icon.1le94j_pe_ih1.png")`),
  and `marker-icon`, `marker-icon-2x`, `marker-shadow` are all emitted to
  `.next/static/media`. `imageUrl()`'s object branch is the unused webpack
  fallback — cheap, keep it. The `ResultMap.js` removal is safe: that map's only
  markers are divIcons.
- **`lg:static` → `lg:relative`** (`GameClient.js:364`) is not scope drift — the
  new `absolute inset-0` roundLoading overlay needs a positioned ancestor at lg.
- **No dead loading states.** Every `setRoundLoading(true)` (lines 258, 293, 300)
  is matched by a clear on both branches; `initialLoading` clears in `finally`.
  `loadError` is recoverable via Retry (`handleRetryLoad`, deliberately passes no
  session id) and via Skip (`if (!imageData && !loadError)` now lets Skip through
  during an error).
- **Session / prefetch semantics.** No double-submit: `handleSubmitGuess` is
  guarded by `submitting` and the server claims the session with an atomic DEL.
  Prefetch reuses the just-consumed id purely as the storage key for a fresh
  round (`new-game/route.js:52-64` overwrites), and the client's `sessionId`
  always comes from the response. On the failed-submit path the still-live old
  session is overwritten with the new round rather than orphaned. Leaving via
  Menu strands one session that expires on its own, as the comment states.
- **Round reset.** `resetRoundState` clears `guessCoordinates`, `result` and
  `mapExpanded` on both Next Round and Skip; `prefetchRef` is cleared on Skip
  (line 290) and consumed exactly once on Next (256-257). No leak found.
- **Input validation.** `getLastRegion()` output passes `isRegion` + `isPlayable`
  before reaching `getRegion()` or the href (`RegionPicker.js:111`), so a
  hand-edited localStorage value cannot inject into the URL or throw.
- **Docs.** `bandsForBbox` grep-verified to exist (`game.js:59`) and to be called
  from `guess/route.js:70`, as both docs claim. `README.md` has no threshold
  table (only "0-5 point system"), so nothing went stale there.

## Acceptance criteria vs plan

| Phase | State |
|---|---|
| 1 Region-relative scoring | Implemented and tested; see H1 for the fairness consequence |
| 2 GameClient split / error / prefetch / last-region | Implemented; M1, M2 |
| 3 Result dialog | Implemented; M3, and H2 (chips untested) |
| 4 Home + Continue row | Implemented; L1 |
| 5 Map robustness | Implemented, verified against build output |
| 6 Verify + docs | Gates green (240/240, 0 lint errors); docs accurate |

Runtime-only criteria — no gate in this repo can prove them, manual check needed:
the panorama does not unmount on submit; the Retry panel actually recovers; the
prefetched round visibly swaps in without a wait; the "Continue in X" row
appears; Leaflet markers render without network access to a CDN.

## Unresolved questions

1. H1: is the district/province board asymmetry accepted, or should scoring move
   to per-level ladders? This is the only blocking decision.
2. L2: should distance-board colouring keep an absolute district scale now that
   awarded scores are relative?
