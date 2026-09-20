# Test Quality Assessment: dev branch

**Date**: 2026-09-21 | **Branch**: dev | **Commit**: 064c173

## Test Execution Results

**All tests pass**: 348 tests across 28 test files executed in 16.90s.

- Unit/integration: daily-route, daily-calendar, daily-progress, debug-access, region-locate, share, skip-route, stats, guess-route, leaderboard, username, new-game-route, geo-search, regions, region-request, skip, leaderboard all pass
- No failing tests; no skipped tests
- Test coverage tool not available (missing @vitest/coverage-v8), so unmapped dead code may exist

## Weak Tests (Would Pass Against Broken Implementations)

1. **daily-calendar.test.js - `previousDay` across month boundaries**
   - Tests `previousDay('2026-10-01')` → `'2026-09-30'` but only one boundary case
   - **Mutation risk**: If `previousDay` ignored month calculation and subtracted days naively, test would still pass if year wrapping was not tested (e.g., Jan 1 → Dec 31)
   - **Recommendation**: Add `previousDay('2026-01-01')` → `'2025-12-31'` and leap-year Feb 29

2. **region-locate.test.js - `locateRegion` only tests two districts**
   - Tests Q7 (TPHCM) and HOANKIEM (HN), but only verifies exact match
   - **Mutation risk**: If `locateRegion` always returned the first district in the boundary list, tests would not catch it (no randomness or edge-case bounds testing)
   - **Recommendation**: Add tests for points near district boundaries and provinces with no mapped districts

3. **stats.test.js - `recordRound` with no player ID**
   - Tests tolerates null playerId but does not verify HyperLogLog is NOT incremented
   - **Mutation risk**: If `pfAdd` was called unconditionally on null playerId, test would still pass
   - **Recommendation**: Explicitly assert that `distinctPlayersAcross` returns 0 when all rounds have null playerId

## Redis Fake Fidelity Issues

**No critical issues found**. The fake Redis correctly implements:
- `hgetall` returns null on missing key, `null` on empty hash (matches real Redis behavior after EXPIRE)
- `hincrby` returns the new value (number, not string) ✓
- `zincrby` returns the new score (number) ✓
- `pfadd` returns 1 if estimate changed, 0 otherwise ✓
- `pfcount` union across multiple keys ✓
- `expire` on missing key returns 0, on existing returns 1 ✓

**Upstash SDK adaptation**: `hGetAllNumbers` properly coerces all hash values to numbers and returns `{}` instead of null (intentional normalization for stats hash).

## Coverage Gaps (Ranked by Risk)

1. **`/api/daily` when Mapillary fails 4 times (MAX_ATTEMPTS)**
   - Code path: `daily.js` lines 39-59 throw after 4 retries, but no test exercises this
   - **Risk**: High — silent failure or unexpected error format to client
   - **Test spec**: `getDailyRound('2026-09-21')` where all 4 candidates fail fetchPanoramaById, verify error message includes "No daily panorama"

2. **`/api/daily` when cached record exists but URL is stale**
   - Code path: Redis caches with 48h TTL (lines 34-36, 51), but no test verifies URL validity past cache
   - **Risk**: Medium — could serve expired Mapillary URLs (though Mapillary signs them for weeks)
   - **Test spec**: Mock Mapillary to return different URL on re-fetch, verify first request uses cache, second (after expiry) uses new URL

3. **POST /api/guess when submitRoundScore throws after session is consumed**
   - Code path: `guess/route.js` lines 130-133 parallelize leaderboard/distance writes after deleteGameSession
   - **Risk**: Medium — if submitRoundScore fails, player loses round credit but session is deleted (not retryable)
   - **Test spec**: Mock leaderboard.submitRoundScore to throw, verify 500 response, session no longer exists, stats recorded (should be, per line 149)

4. **POST /api/guess when stats recording (recordRound) fails**
   - Code path: `guess/route.js` lines 149, wrapped in try-catch that logs but does not fail
   - **Risk**: Low — design is intentional (stats failure must not block guess), but no test verifies this tolerance
   - **Test spec**: Mock recordRound to throw, verify guess succeeds, session consumed, leaderboard updated, no error to client

5. **stats.test.js - EXPIRE behavior across day boundaries**
   - Code path: `stats.js` lines 61-67, EXPIRE called only when count==1 (first occurrence of level:score pair)
   - **Risk**: Medium — if a new level appears on day 1 and again on day 2, second day's EXPIRE may not fire
   - **Test spec**: recordRound on same level:score pair across two UTC days, verify both day keys have TTL set

6. **region-request.js regionName fallback when nameVi is absent**
   - Code path: Not visible in test reads, but `publicRegion()` must handle missing Vietnamese names
   - **Risk**: Low-Medium — only affects UI, but can silently render undefined
   - **Test spec**: Add mock region with no nameVi, verify publicRegion() returns English fallback or throws appropriately

7. **validateUsername on auto-generated 'Player-abc123' names**
   - Code path: Tests cover 'mai', too-long, colon-containing names, but no test for generated format
   - **Risk**: Low — test coverage is broad, but the exact shape username.js generates may differ
   - **Test spec**: Call validateUsername with output of username generation function, verify it accepts itself

8. **DailyCard/GameClient daily replay path (component-level)**
   - Code path: Browser-only, cannot test without DOM
   - **Risk**: Low-Medium — hard to test without browser, but daily progress replay uses localStorage with no server validation
   - **Test spec**: Note as untestable without e2e; defer to e2e suite

## E2E Locator and API Shape Verification

**All locators correctly updated** from English to Vietnamese:

✓ `game.spec.js` line 18: `'Hồ Chí Minh'` (was `'Ho Chi Minh'`)
✓ `game.spec.js` line 45: `'Vietnam › Hồ Chí Minh › Quận 7'` (was `'Vietnam › Ho Chi Minh › District 7'`)
✓ `home.spec.js` line 16: `Hồ Chí Minh` button, `Quận 7` link
✓ `home.spec.js` line 32: `'Củ Chi'` uncovered district (was `'Cu Chi'`)

**E2E response shapes** in `tests/e2e/helpers.js`:

✓ `newGameResponse()` region name and path updated
✓ `guessResponse()` scoreLevel/distanceLevel names updated, path updated
✓ `{trimmed: false}` field present in scoreLevel (removed in earlier PR? verify)

**Minor concern**: scoreLevel and distanceLevel mock helper on line 47-48 includes `trimmed: false` but tests do not assert this field's absence/presence. Verify real route response includes it.

## Flakiness Risks

1. **daily-route.test.js uses `dailyDay()` without mocking time**
   - Line 96: `expect(body.day).toBe(dailyDay())`
   - **Risk**: Test fails if run during Vietnam midnight (UTC 17:00) when day rolls over during execution
   - **Fix**: Mock `Date.now()` in beforeEach, or use fixed timestamp in assertion

2. **stats.test.js uses `statsDay()` without mocking**
   - Lines 33-34: `statsDay(DAY1)` with hardcoded dates is safe (uses passed timestamps)
   - Lines 41, 48: `statsDay()` with no args uses Date.now() — safe since test only counts relative days within one test run
   - **Risk**: Low (test is internal to one run), but could fail if run at UTC/calendar boundary

3. **daily-progress.test.js `nextStreak` uses hardcoded dates**
   - All dates are passed as arguments; no `Date.now()` used
   - **Risk**: None — test is deterministic

## Unresolved Questions

1. Does `trimmed: false` belong in e2e scoreLevel responses, and does the real route include it?
2. Is month-boundary handling in `previousDay()` tested elsewhere (e.g., in daily-calendar e2e)?
3. Does the game support 0-point rounds (score === 0) on the leaderboard, and are they tested?

---

**Status**: DONE_WITH_CONCERNS

**Summary**: 348 tests pass; core logic well-covered. Missing tests for Mapillary exhaustion (4 failures), stats failure tolerance, and edge cases in region/streak logic. Three low-level flakiness risks around date/time mocking.

**Concerns**: Weak tests for nextStreak month boundaries and region location; missing coverage for daily route failure modes and stats recording robustness. E2E locators correctly updated; no shape mismatches found.
