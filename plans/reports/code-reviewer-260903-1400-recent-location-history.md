# Code review — recent location history filter

Date: 2026-09-03 | Plan: `plans/260903-1322-recent-location-history-filter/`
Reviewer verdict: **DONE_WITH_CONCERNS** — 3 medium, 3 low. All resolved or
consciously declined below. No critical or high findings.

## What was reviewed

The last-50-locations-per-player filter: `src/lib/player-id.js`,
`src/lib/pano-history.js`, the `recentIds` parameter and soft-exclusion
fallback in `src/lib/mapillary.js`, the wiring in
`src/app/api/new-game/route.js`, and five test files.

## Cleared under inspection

- Soft/hard exclusion split is correct: `tried` is never relaxed, `applyRecent`
  latches false so the inner redraw fires at most once per round, no loop spin,
  worst case ~40 DB queries for 3 Mapillary attempts.
- Infrastructure errors still propagate as 500s in both directions; classified
  solely on the `No panoramas left` message prefix.
- District-from-the-winning-attempt invariant survives the destructuring
  rewrite. Session single-use, `/api/guess`, `/api/skip` untouched.
- Anti-cheat boundary intact: response body unchanged apart from `Set-Cookie`.
- Small-region degradation bounded: smallest playable region holds 171 rows, so
  50 excluded is 29.2%; eight rejection draws all missing is ~5e-5, and the
  filtered fallback is exact. No playable region can be structurally exhausted.
- Cookie parsing verified against first-`=` split, name-boundary, whitespace,
  empty, over-long, and `history:*` inputs.
- Test load-bearingness audited: eight of the new tests fail if the feature is
  removed. Three are regression guards that pass either way — named as such
  rather than counted as feature coverage.

## Findings and resolutions

| # | Finding | Resolution |
|---|---|---|
| M1 | `pano-history.js` header claimed the stored ids "are not answers to a live round". False: recording happens at round creation, so element 0 *is* the live answer. And `tests/regions.test.js` `FORBIDDEN` did not list `pano-history`, so nothing stopped a future client component importing it. | Fixed. Comment rewritten to state the exposure; `'pano-history'` added to `FORBIDDEN`. |
| M2 | The downgrade `console.warn` fired for genuinely empty regions too, so a region mid-reseed holding zero rows would log "Recent-location filter exhausted …", sending an operator to tune `HISTORY_LIMIT` instead of to the broken reseed. Reproduced in the suite's stderr. | Fixed. The warning now fires only when the unfiltered redraw actually yields a candidate — the one condition that proves the history was to blame. Test added asserting silence on an empty region. |
| M3 | `pano-index.js` still documented `excludeIds` as "at most the two ids already tried this round"; it now holds up to 52, and that comment is the only record of why rejection sampling was chosen. | Fixed. Comment now carries the real bound, the 29%/5e-5 arithmetic, and what would invalidate the trade. |
| L1 | `readPlayerId` returned `null` on the *first* `vng_pid` it found if that value failed validation. One shadowing duplicate cookie (different path or `.domain` scope) would silently disable the feature for that browser forever. | Fixed. Scans past an invalid value; returns `null` only after the loop. Test added. |
| L2 | `UUID_PATTERN` was case-insensitive, so an uppercase twin became a distinct Redis key — a self-inflicted split history. | Fixed. Case-sensitive now. Test added. |
| L3 | Phase 2 claimed two added Redis round-trips per round; it is three (GET, GET, SET). | Plan corrected. The extra read is kept deliberately: reusing the route's copy would stretch the read-modify-write window across the whole Mapillary fetch. |
| L4 | `still hides the answer once a cookie is in play` near-duplicates an existing assertion. | **Declined.** It is thin, but it is the only test covering body construction on the path where the response object is mutated by `cookies.set`. |
| L5 | The empty-region test did not silence `console.warn`. | Dissolved by the M2 fix — that path no longer warns. The test now asserts it does not. |
| L6 | Phase frontmatter said `status: todo` while `plan.md` said completed. | Reconciled. |

## Verification after fixes

- `npm test` — 265 passed / 19 files (263 before the fixes, 248 before the feature).
- `npm run lint` — 0 errors, 19 pre-existing warnings in untouched client components.
- `npm run build` — clean.
- `npm run test:integration` — 260 passed / 3 skipped against real Redis, run
  before the fixes; the fixes touch no Redis call shape.

## Unresolved questions

1. `scanKeys` in `src/lib/upstash.js` has no caller anywhere in `src/` or
   `scripts/`. The UUID validation it was cited to justify is right regardless,
   and the rationale comment has been reworded not to depend on a live caller —
   but is `scanKeys` a real ops/backup surface used outside this repo, or dead
   code that should go?
2. Whether the functional `vng_pid` cookie warrants a cookie notice. No code
   impact; flagged in the plan as the user's call.
3. `username.spec.js` fails 3 of 4 Playwright specs on clean `main` — a dialog
   overlay intercepts a Play click. Pre-existing, unrelated to this change,
   confirmed by stashing the work and re-running. Not fixed here.
