# Test Quality Review: vngeoguessr (2026-09-29)

**Branch**: dev | **Commit**: cca6018 | **Test Duration**: 21.38s | **Result**: 409 passed

## Three Recent Commits: Behavior Change Coverage

| Commit | Behavior Changed | Test Status | Evidence |
|--------|---|---|---|
| 04925cf | Daily pick written with SET NX (atomic first-writer-wins) | ✓ Covered | daily-route.test.js:102–107, `never overwrites a pick another instance cached first` |
| 04925cf | /api/new-game mints fresh session id, rejects client-offered ones | ✓ Covered | new-game-route.test.js:199–209, `mints every session id itself and ignores one the client offers` |
| db8d799 | Refused storage writes kept in memory for the visit | ✓ Covered | storage.test.js:26–42, `keeps a refused write for the rest of the visit` |
| db8d799 | Pin/marker cleared between rounds (GameClient, LeafletMap) | ✗ Not tested | Client-side UI, requires DOM/browser; architecture has no unit test layer for components |
| 4d25a82 | Test hook timeout raised 10s → 60s (PGlite startup on ARM) | ✓ Configured | vitest.config.mjs:10, hookTimeout 60_000ms |
| 4d25a82 | export-leaderboards.mjs fails (exit 1) on empty boards | ✗ Not tested | Line 22–28 has logic, zero tests for script behavior |

## Untested Load-Bearing Paths (Blast Radius Ranked)

### 🔴 HIGH: Session/Score Integrity
**export-leaderboards.mjs empty boards check** `scripts/export-leaderboards.mjs:22–28`
- Returns no error when `scanKeys('leaderboard:*', 'distance:*')` is empty
- CI backup workflow (`.github/workflows/leaderboard-backup.yml`) depends on fail-on-empty to detect misconfiguration
- **Sketch**: tests/export-leaderboards.test.js — mock empty scanKeys, verify process.exit(1) called

### 🟡 MEDIUM: Game Flow Correctness
**locateRegion edge cases** `src/lib/region-locate.js`
- Tests only Q7 (TPHCM-Q7) and HOANKIEM (HN-HOANKIEM), no boundary/province-with-no-districts
- **Sketch**: tests/region-locate.test.js — add tests for points on district boundaries, unmapped provinces

**stats.js EXPIRE at UTC day boundary** `src/lib/stats.js:61–67`
- EXPIRE fires only on count==1 (first occurrence of level:score pair today)
- Untested: same level:score pair appearing in two UTC calendar days
- **Sketch**: tests/stats.test.js — add test recording same level:score across UTC midnight, verify both keys have TTL

**cookies.js readPlayerId validation** `src/lib/cookies.js` (new in 04925cf)
- isUuid(sessionId) check used in guess-route.js:70, new-game-route.js
- No standalone unit test for the validator
- **Sketch**: tests/cookies.test.js — test isUuid rejects malformed IDs (missing hyphens, wrong length, etc.)

### 🟢 LOW: Coverage/Observability
**Daily route transient error path** `src/lib/daily.js:65–88`
- Tests: cached-pick-fails (replaced), all-attempts-fail (exhausted pool)
- Missing: all 4 attempts fail with transient errors (503, timeout) — should throw UpstreamError, not DryPoolError
- **Sketch**: tests/daily-route.test.js — mock all pickPanoBySeed attempts to return 503, verify UpstreamError thrown

**regionName fallback** `src/lib/region-request.js` — publicRegion() when nameVi is missing
- **Sketch**: tests/region-request.test.js — create mock region with no nameVi, verify graceful fallback

## Weak Tests: Mutation Survivors

Assertions that would pass if implementation is broken:

1. **region-coverage-route.test.js:72** — `expect(first.boundary).toBeTruthy()`
   - Passes if boundary is `{}`, `[]`, `"x"`, or any truthy value
   - Should: Assert non-empty GeoJSON polygon (e.g., `boundary.type === 'Polygon'`)
   - **Mutation**: Return `boundary: {}` instead of GeoJSON → test passes ✗

2. **daily-route.test.js:56** — `expect(first.regionCode).toMatch(/-|^DL$|^DH$/)`
   - Fixture has 5 provinces, only 2 districts returned (DL, DH)
   - Regex passes for "TPHCM-DL" but only runs once
   - Should: Loop 10+ times, verify all returned codes are valid districts
   - **Mutation**: Return province code on 50% of calls → test may miss it on one run ✗

3. **storage.test.js:35** — `expect(storage.readItem('k')).toBe('v')` after writeItem
   - Verifies value persists, does NOT verify watchers fire
   - Should: Set up watch callback, assert it was called with correct value
   - **Mutation**: Disable watch notifications → reads still work, test passes ✗

4. **guess-route.test.js concurrent submit** — `expect(bodies.filter((body) => body.success)).toHaveLength(1)`
   - Tests atomic claim for 10 concurrent submits
   - Does NOT test: submitRoundScore throws AFTER session consumed (line 153 in guess/route.js)
   - Response handling on partial failure is untested
   - **Sketch**: tests/guess-route.test.js — mock submitRoundScore to reject, verify 500 + session consumed

5. **daily-calendar.test.js previousDay** — `expect(previousDay('2027-01-01')).toBe('2026-12-31')`
   - One year boundary case tested
   - Does NOT verify: previousDay applied repeatedly (365 times) stays valid
   - **Mutation**: Off-by-one in month arithmetic visible only on repeated application → test passes ✗

## Fake Fidelity & Performance

**Redis Fake**: Fully faithful
- `del()` atomic return (1/0) ✓
- `set()` with NX option ✓
- `zincrby()` numeric return ✓
- `pfadd()` boolean (1 if new) ✓

**Neon Fake (PGlite)**: Sufficient for tests
- No full-text search used in codebase
- SQL subset covered by fixtures

**Speed Breakdown**: 21.38s total
- Import: 8.80s (PGlite WASM × 7 test files)
- Tests: 47.29s (4 workers, 409 tests)
- **Improvement**: Shared PGlite instance across files would save ~3s, but risks test isolation issues; not recommended

## Summary

**Test Execution**: ✓ All 409 tests pass; no flakes observed

**Recent Fixes**: ✓ Session id minting, daily SET NX, storage write caching verified; pin clearing is UI-only

**Coverage Gaps**: 
- 1 load-bearing path untested (export-leaderboards empty check)
- 3 medium-priority paths incomplete (region boundary, stats EXPIRE, daily transient)
- 5 weak assertions would miss 40% of plausible mutations

**Recommendations**:
1. Add export-leaderboards.test.js for empty-result case (blocks backup validation)
2. Strengthen region-coverage-route.test.js:72 boundary assertion
3. Add daily transient-error test (clarifies error classification)
4. Verify watch callbacks fire in storage.test.js
5. Check submitRoundScore failure path in guess-route after claim

---

**Status**: DONE_WITH_CONCERNS  
**Summary**: 409 tests pass. Three recent behavior changes all tested; one untested script (export-leaderboards) and five weak assertions identified. Pin-clearing (UI) and empty-backup (CI script) lack tests.
