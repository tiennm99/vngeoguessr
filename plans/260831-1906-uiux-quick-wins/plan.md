# UI/UX Quick-Win Fixes

Status: done (2026-08-31) | Source: plans/reports/synthesis-260831-1853-uiux-improvement.md
Review: plans/reports/code-reviewer-260831-1906-uiux-quick-wins.md — H1 resolved
per user decision as per-level ladders (`submitRoundScore`); H2/M1/M3 fixed.
Follow-up pass fixed the accepted leftovers too: M2 (roundLoading now clears on
panorama 'ready'; viewer keyed by a per-round counter so a repeated pano URL
still remounts), distance-board tints graded by each board's own ladder
(`LeaderboardList` regionCode prop), home table "1km" label trim.
Third review round (3 parallel scoped reviewers, reports
code-reviewer-260831-2145-*.md): no breaking change found. Fixed from it:
stale-guess clobber after watchdog release (applyRound clears guess + stamps
applied epoch; ready handlers epoch-guarded), Submit gated on sessionId, Skip
clears loadError, submitRoundScore rejects non-numeric/negative distance,
SCORE_BANDS deep-frozen, bandsForDiagonal NaN guard, honest e2e fixtures
(real TPHCM ladder, sessionId echo, image-swap assertion), literal per-level
unit expectations, docs/caption wording ("base scale", not "district round").
Verified: 248 unit, 9 e2e, lint 0 errors, build clean.

Outcome: apply quick-win fixes without breaking existing behavior or contracts.
Constraints: JS only, individual params, keep 0-5 score scale + existing board
keys, no schema changes, district-round scoring unchanged for typical districts.
Non-goals: 5-round set, daily challenge, keyboard guess placement, mobile rework.
Acceptance: `npm test`, `npm run lint`, `npm run build`, Playwright e2e all green.

## Phases

1. **Region-relative scoring** — `src/lib/game.js`: `bandsForDiagonal`,
   `bandsForBbox`, `calculateScore(distance, bands=SCORE_BANDS)`;
   `src/app/api/guess/route.js`: scale bands by picked region bbox
   (`session.pickedRegion ?? session.cityCode`), return `bands` in gameResult.
   Tests: extend `tests/game.test.js`, `tests/guess-route.test.js`.
2. **GameClient state split + error + prefetch + last-region** —
   `initialLoading`/`roundLoading`/`submitting`/`loadError`; inline error panel
   with Retry/Back replacing `alert()`; prefetch next round (+image preload) on
   result open; write last-played region to localStorage
   (`src/lib/last-region.js`, new).
3. **Result dialog** — no dismiss (no close button, noop onOpenChange), sr-only
   DialogDescription, aria-live fix (static sr-only status, animation not
   announced), band-scale chips from `result.bands` (skip when absent).
4. **Home** — scoring table derived from SCORE_BANDS + region-scaling caption;
   "Continue in X" row in RegionPicker from last-region storage.
5. **Map robustness** — self-hosted Leaflet marker icons via static imports in
   `LeafletMap.js`; drop dead cdnjs icon config in `ResultMap.js`.
6. **Verify + docs** — full test suite, lint, build, e2e; update
   `docs/features.md` + `docs/game-flow.md` scoring sections.

Risk: score semantics change for province/country rounds (accepted; boards mix
eras). Rollback: revert commit; no data migration involved.
