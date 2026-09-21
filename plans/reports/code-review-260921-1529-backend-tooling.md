# Backend / pipeline / test-tooling review — `dev` @ 77654d2

Read-only review of `src/lib/`, `src/app/api/`, `scripts/`, `tests/`, configs, CI, docs.
No files changed except this report.

## 1. Gates

| Gate | Result |
|---|---|
| `npm run lint` | pass — 0 errors, 21 warnings (`react-hooks/set-state-in-effect` 14, `react-hooks/refs` 7). Up from the 16 recorded on 2026-08-31; no new rule ids, all the established localStorage/ref pattern. |
| `npm test` | pass — 29 files, 357 tests, 25s |
| `npm run build:check` | pass — 7 dynamic routes, 86 SSG paths |
| `npm run test:integration` | not run (no Redis container here) |
| `npm run test:e2e` | not runnable (no browser on this host) |

## 2. Findings

### 2.1 Duplication

| # | Where | Refactor | Must NOT absorb |
|---|---|---|---|
| D1 | `.env` parser copied 4x: `build-pano-index.mjs:49-61`, `seed-pano-db.mjs:33-47`, `stats.mjs:20-36`, `export-leaderboards.mjs:14-30` | `scripts/lib/env.mjs` exporting `loadDotEnv()` that applies `process.env[k] ??= v`. `paths.mjs` already proves `scripts/lib` is the right home. | Keep the *variable* lookups at each call site — `build-pano-index` needs `MAPILLARY_ACCESS_TOKEN`, `seed-pano-db` needs `DATABASE_URL ?? POSTGRES_URL`, and their error messages are the script's own contract. Only the parse is shared. Note `build-pano-index`'s copy lacks the `^"(.*)"$` unquoting the other three have — a quoted token silently breaks it today; fixing that is the point. |
| D2 | `recentPanoIdsOrNone` / `recordPanoOrIgnore` (`new-game/route.js:31-52`), `distanceOrNone` / `recordRoundOrIgnore` (`guess/route.js:38-54`) | One `src/lib/tolerate.js`: `export async function tolerate(label, fn, fallback)` — logs `label` and returns `fallback`. Four call sites collapse to `tolerate('Recent-location lookup', () => getRecentPanoIds(id), [])`. | Do not make it a default for *all* store calls. The comments at `new-game/route.js:20-24` and `guess/route.js:31-37` state *why* each one is tolerable (history is a convenience; distance boards are the lesser record after the session is consumed). That reasoning must move into the call-site argument, not be erased by a blanket helper. Individual params per house rule. |
| D3 | `{ success:false, error, details: NODE_ENV==='development' ? e.message : undefined }` in 4 routes: `guess:203-208`, `new-game:161-165`, `daily:50-54`, `leaderboard:42-46` | `src/lib/api-error.js` → `serverError(message, error)` and `badRequest(message, reason)`. | The per-route `error` string is user-facing copy, not a generic; `new-game:150-159` maps three causes to three messages and must keep doing so. And `guess`'s `reject(error, reason)` carries a machine-readable `reason` the client switches on — keep that second field. |
| D4 | Cookie set duplicated: `new-game/route.js:144` and `daily/route.js:46`, both preceded by the same `readPlayerId(request) ?? newPlayerId()` | Add `withPlayerCookie(response, playerId)` to `player-id.js` — it already owns `PLAYER_COOKIE` and `playerCookieOptions`. | Keep "success path only": `new-game` deliberately does not set it on its five error returns (`new-game/route.js:140-143`). A helper applied in a wrapper/middleware would change that. |
| D5 | `vi.mock('@upstash/redis', …)` + `vi.mock('@neondatabase/serverless', …)` hoisted in 13 test files, each 4 lines delegating to `mock-upstash.js` / `mock-neon.js` | Hoisting means it cannot become an import. Move both into a Vitest `setupFiles` entry (`tests/setup-mocks.js`) registered in both configs; delete the 13 blocks. `guess-route-resilience.test.js:11-30`, which mocks `src/lib/upstash.js` and `src/lib/stats.js` on purpose, keeps its own. | Do not fold the `TEST_REDIS==='real'` branch away — it is the whole integration lane (`mock-upstash.js:8`). |
| D6 | `MAPILLARY_ACCESS_TOKEN` save/restore copied in 4 files: `mapillary.test.js:19,40,45`, `new-game-route.test.js:23,35,58`, `daily-route.test.js:25,38,59`, `new-game-history-failure.test.js:35,43,62` | Vitest has `vi.stubEnv` + `vi.unstubAllEnvs`, or put `MAPILLARY_ACCESS_TOKEN: 'test-token'` in both `vitest.config*.mjs` `env` blocks beside the three already there. | `mapillary.test.js` needs to *delete* the var to prove `requireAccessToken` throws — that test must keep an explicit unset. |
| D7 | `catch (e) { console.error(...); throw e }` with no handling: `session.js:19-22,35-38,55-58`, `leaderboard.js:123-126,233-237,273-277,353-357`, `game.js:14-17` | Delete. The caller logs (`guess/route.js:202`, `new-game/route.js:148`), so every failure is logged twice and `leaderboard.js` additionally replaces the error with `new Error(e.message)`, discarding the stack and cause. | `fanOutScore:180-184` genuinely logs per-level and rethrows only when nothing landed — that one is load-bearing. |
| D8 | `childrenOf` re-declared in `assign-pano-districts.mjs:36` and `build-region-boundaries.mjs:223`; province filter re-declared in `seed-pano-db.mjs:56`, `build-pano-index.mjs:291`, `build-region-boundaries.mjs:536` | `src/lib/regions.js` already exports `childrenOf`, `provinceOf`, `isRegion`, `COUNTRY_CODE` and is client-safe, so scripts may import it. | `build-region-boundaries.mjs` **writes** the tree `regions.js` reads, and `assign-pano-districts.mjs` writes `counts.js` which `regions.js` imports. Those two must keep reading their own inline config / raw JSON or a half-built tree becomes an input to its own builder. Only `seed-pano-db` and `build-pano-index` can safely switch. |

### 2.2 `leaderboard.js` (357 lines) and the `/api/guess` response

- Score and distance boards duplicate structure without sharing code: `creditScore:137-154` vs `creditDistance:288-304`, `fanOutScore:164-203` vs the inline `Promise.all` at `submitDistanceRecord:334-352`, and two near-identical `byLevel` closures (`:189-190`, `:340-341`). `getLeaderboard:80-127` branches on `type` in three places.
- **Target shape.** One `fanOut(h, regionCode, creditFn)` returning `{ levels, partial }`, plus one `byLevel(levels)` helper; `submitRoundScore` and `submitDistanceRecord` become thin wrappers differing only in their credit function. Distance keeps its own trim (`:294`) — score boards are deliberately untrimmed (`:22-29`) and that asymmetry must survive the merge. Note `submitDistanceRecord` uses `Promise.all`, so one level's failure loses the whole record while the score path settles — unify on `allSettled`.
- **Legacy aliases are dead, not just legacy.** `city` (`:201`), `cityDistance` (`:350`), `districtDistance` (`:347`) have **zero** readers anywhere. `global` / `province` / `globalDistance` / `provinceDistance` are read only by `guess/route.js:187-190` to build `globalRank` / `cityRank` / `globalDistanceRank` / `cityDistanceRank`, and **no client reads those four either** — `GameClient.js:346-358` consumes `levels` and `distanceLevels` only. So the entire alias layer can go, and with it `getRegion` as a `leaderboard.js` import.
- `/api/leaderboard` `count`, `region`, `leaderboardType`, `type`, `cityCode` (`route.js:32-37`): `LeaderboardModal.js:51` reads `data.leaderboard` and nothing else. All five are unread.
- **`submitScore` (`:218-237`) has no production caller** — the fan-out that runs is `submitRoundScore`. Its own doc comment says "for tests and backfills", but `tests/leaderboard.test.js` uses it as the *primary* way to reach the score boards (13 call sites), so the suite's main write path is a function production never executes. Delete it and drive those tests through `submitRoundScore(name, distance, code)` with distances chosen off `SCORE_BANDS`; that also makes the ladder part of what the boards test.
- Distance member `"username:distance:timestamp"` (`:332`) is parsed back at `:107`. It works only because `username.js:25` excludes `:` — the coupling is documented there, so keep it, but the encode/decode pair should sit next to each other in one `distanceEntry.js` (or as two functions at the top of the module) rather than 225 lines apart. A JSON member would be cleaner but breaks every stored board and the backup format; not worth it.
- **Compatibility path.** These fields are consumed by nothing but `tests/e2e/helpers.js` (`leaderboardResponse()` emits `type`/`cityCode`; `guessResponse()` emits `globalRank`/`cityRank`/`globalDistanceRank`/`cityDistanceRank`). So the removal is: (1) delete the aliases in `leaderboard.js`, (2) delete the four rank fields and the five leaderboard fields from the routes, (3) delete them from `helpers.js`, (4) drop the alias assertions from `leaderboard.test.js`. No client change, no migration, one commit. External bookmarks send `?city=` — that is `region-request.js:31` and is unaffected.

### 2.3 `pano-index.js` / `mapillary.js` — one draw primitive?

- `pickPanoBySeed:191-218` re-implements the country branch of `pickRandomPano:90-109`: playable-province filter, pick a province, draw a row, skip a dry province, plus the same stale-count recovery (`:210-214` vs `:131-139`) and the same `toChoice` call. The only real differences are *how the index is chosen* (hash vs `Math.random`) and *how a dry province is skipped* (deterministic walk vs destructive `splice`).
- **Yes, one primitive.** Extract `drawFromProvinces(provinces, indexFn, excludeIds)` where `indexFn(n, salt)` returns an index — `() => Math.floor(Math.random()*n)` for the random path, `(n, salt) => hash32(`${seed}:${salt}`) % n` for the seeded one. Both then share dry-province skipping and cache-refresh. Effort M, no behaviour change if the seeded path keeps `.sort()` on provinces (`:192`) so its pick stays stable.
- **Do not** merge the 8-attempt rejection sampling + `NOT (id = ANY(...))` fallback (`:123-161`) into that primitive: it is province/district-local and its trade-off is argued against `HISTORY_LIMIT` at `:116-122`. Keep it as the leaf draw the shared primitive calls.
- `countCache` (`:35`) is process-lifetime with no TTL and is invalidated only by the two overshoot paths. That is documented and fine, but `countPanos`'s country branch (`:44-48`) awaits provinces serially and has **no production caller** — `region-coverage` rejects the country (`route.js:28`) and `pickRandomPano` recurses into a child before counting. Tests are its only caller.
- `mapillary.js`'s `drawCandidate:90-97` string-matches `error.message.startsWith('No panoramas left')` — so does `pickRandomPano:106`. Three throw sites construct that string. Export a `DryPoolError` (or a `{ dry: true }` marker) from `pano-index.js` instead; a reworded message currently turns a dry pool into a 500 and no test would catch it.
- `region-coverage/route.js:79` calls `countPanos(code)` again after `getRegionPanoSample:242` already did — harmless (cached) but the sample already returns `total`; use it.

### 2.4 Scripts

- `build-region-boundaries.mjs` is 600 lines, of which the inline `REGIONS` source config is `:69-203` (135 lines). **Yes, move it** — `scripts/lib/region-config.mjs`. It is *input data*, hand-edited to add coverage (the header says coverage "grows by adding entries below"), and it collides conceptually with the generated `REGIONS` the other scripts import from `src/data/regions/index.js`. Two different things under one name in one directory is the main readability problem in the pipeline. After the move the script is ~465 lines of fetch/simplify/write, which is acceptable for a one-shot builder.
- **One `data:rebuild`: yes, but sequenced not aliased.** `package.json` already has the four steps and a `data:repartition` pair. Add `"data:rebuild": "npm run data:boundaries && npm run data:panos && npm run data:districts && npm run data:seed"`. Guard it in the README/docs with the cost note that already exists in `docs/development.md:208-211` — `data:panos` spends ~2,800 of a 50,000/day Mapillary budget, so a one-word command that silently does that needs the cost stated at the command, not two docs away.
- `scripts/lib` is the right home: `paths.mjs` resolves from `import.meta.url` rather than cwd, `pano-schema.mjs` is shared with `tests/pano-fixtures.js`, `pano-artifacts.mjs` is tested. Add `env.mjs` (D1) there.
- **Untested:** `scripts/lib/assign-districts.mjs` — 221 lines, 10 exports (`prepareDistricts`, `districtFor`, `nearestDistrict`, `assignPanos`, `coverageVerdict`, `outlineSegments`, `cellKey`), the code that decides which district a panorama is credited to, i.e. which board a guess scores on. **Zero tests.** `tests/pano-artifacts.test.js` validates the *output* against the tree, which catches a contradiction but not a wrong-but-consistent assignment. This is the single biggest test gap in the repo. Also untested: `build-region-boundaries.mjs` (its `dropSlivers`/`isReal` ring filters are pure and easily tested), `build-pano-index.mjs`'s `tileFor`, `seed-pano-db.mjs`'s batching, `stats.mjs`, `export-leaderboards.mjs`.
- `build-pano-index.mjs:46` `MAX_PER_CITY = Infinity` makes `:217-224` unreachable — dead branch, delete both.

### 2.5 Tests

**Over-tested / tautological**
- `tests/upstash.test.js` (198 lines) largely asserts that Redis is Redis — "overwrites rather than accumulating on re-add" (`:113`), "ranges ascending"/"descending" (`:120,130`), "returns an empty list for a missing key" (`:161`). Against SRH these test Redis; against the fake they test the fake. Worth keeping only the prefixing (`:36-52`), the JSON round-trip/TTL (`:53-94`), and `reshapeWithScores` (`:147`) — the adapter's actual contributions.
- `tests/regions.test.js:95` "holds one country, nine provinces and 75 leaves" and `:187` "keeps the hand-picked centres" pin generated data; they fail on every legitimate coverage addition without describing a defect.
- `tests/barrel.test.js` (1 test) re-derives the barrel and byte-compares — good, keep.

**Under-tested — top 8**
1. `scripts/lib/assign-districts.mjs::districtFor`/`nearestDistrict` — a point inside district A is assigned A; a point in the gap between two polygons goes to the nearer one, not the first listed.
2. `GET /api/leaderboard` — no route test exists at all: `?limit=-1` and `?limit=9999` clamp to 1..200; `?region=NOPE` is 400 not an empty board; `?type=distance` returns decoded entries.
3. `POST /api/guess` username validation — a 25-char or `mai:evil` name is rejected 400 `invalid-username` *before* any board write (`route.js:71-73` is untested).
4. `POST /api/skip` — only one test; add: non-UUID `sessionId` is 400 and touches no key; a non-JSON body is 400 not 500.
5. `GET /api/debug/pano` — no test: non-numeric `id` is 400; the production gate returns 404; a Mapillary failure is 502 and does not echo the upstream body.
6. `pickRandomPano` stale-count recovery (`pano-index.js:131-139`) — with a cached count larger than the table, the draw refreshes the cache and still returns a row.
7. `getLeaderboard` type/limit clamping in the lib (`leaderboard.js:90`) — `limit: -1` returns 1 entry, not a reversed slice.
8. `gameResult.partial` reaches the player (see 2.7) — a route-level test exists (`guess-route-resilience.test.js:68`), nothing covers the hand-off.

**`tests/regions.test.js` source-scanning boundary test** — right mechanism, keep it. A regex import walk is crude, but it is the only check that runs *before* a bundle exists and its failure message names the file and specifier. Two known limits, both already recorded in the file's own comments: it cannot see a dynamic `import(variable)`, and it only forbids the five names in `FORBIDDEN` (`:264-270`). Add `daily.js` to that list — it is server-only, it holds the day's answer, and it is currently absent. The stronger alternative (asserting against the real client bundle after `next build`) costs a build per run and would not have caught the `@/` alias gap the current test was fixed for; not worth swapping.

**Fake Redis as a shared package-level util** — no. `tests/fake-upstash-redis.js` (273 lines) implements exactly the 15 primitives `upstash.js` exposes, and its value is that `npm run test:integration` runs the same assertions against real Redis and keeps it honest (`redis-harness.js:1-10`). Promoting it to a package adds a version boundary between the fake and the adapter it shadows, with no second consumer. Leave it in `tests/`.

**E2E stub drift** — real and currently live:
- `helpers.js::guessResponse` omits `hit`, which `GameClient.js:356` and `RoundResultDialog` both consume — so the region-hit line renders in zero e2e runs.
- It omits `partial`, `guessedRegion`, and `region.level` variations.
- It still emits `globalRank`/`cityRank`/`globalDistanceRank`/`cityDistanceRank` (dead, 2.2) and `leaderboardResponse` still emits `type`/`cityCode` (dead).
- **There is no `**/api/daily**` route stub**, and no spec visits `/daily`. The daily page is entirely outside the e2e lane; if a spec ever navigates there it silently hits the dev server's real handler.
- Cheapest durable fix: export the stub payload builders from one module and add a vitest test that asserts the stub's key set is a superset of the real route's response key set, driven by the existing route tests' fixtures. That converts the header's manual promise into a gate.

### 2.6 Dead code (grep-verified, production callers only)

| Symbol | Location | Evidence |
|---|---|---|
| `submitScore` | `leaderboard.js:218` | only `tests/leaderboard.test.js` |
| `city`, `cityDistance`, `districtDistance` | `leaderboard.js:201,350,347` | zero readers anywhere |
| `global`, `province`, `globalDistance`, `provinceDistance` | `leaderboard.js:197-202,346-348` | read only to build four dead response fields |
| `gameResult.globalRank/cityRank/globalDistanceRank/cityDistanceRank` | `guess/route.js:187-190` | no client reader |
| `gameResult.guessedRegion` | `guess/route.js:185` | no client reader (`hit` is the consumed part) |
| `count`, `region`, `leaderboardType`, `type`, `cityCode` | `leaderboard/route.js:32-37` | `LeaderboardModal.js:51` reads `data.leaderboard` only |
| `zScore` | `upstash.js:132` | no `src/`/`scripts/` caller since `creditScore` moved to `zIncrBy` |
| `indexedProvinces` | `pano-index.js:300` | only `pano-index.test.js:173` |
| `countPanos` country branch | `pano-index.js:44-48` | no production caller reaches it |
| `isDay` | `daily-calendar.js:47` | only `daily-calendar.test.js` |
| `MAX_PER_CITY` cap branch | `build-pano-index.mjs:46,217-224` | `Infinity` makes it unreachable |
| `DAILY_EPOCH`, `STATS_TTL_DAYS`, `HISTORY_TTL`, `PLAYER_COOKIE_MAX_AGE` | exported, used in-file + tests | keep — asserting a constant against itself is weak, but these pin TTL contracts |

**Doc drift** (small; `/docs` is in unusually good shape and the top-200/trim text is current):
- `docs/project-structure.md:121-157` enumerates every `src/lib/` module but omits `geo-search.js` (170 lines, added 2026-09-20).
- `docs/project-structure.md:160-172` lists `scripts/lib/assign-districts.mjs` and `pano-schema.mjs` but omits `barrel.mjs`, `paths.mjs`, `pano-artifacts.mjs`.
- Both files are self-falsifying enumerations by construction — consider replacing the per-file lists with a one-line pointer to the directory plus the *non-obvious* entries only (the server-only markers).

### 2.7 Error handling and logging

- **Shape is consistent** on failure (`{success:false, error, …}`) with one real exception, below.
- **200 for a failure — real bug.** `new-game/route.js:83-86` returns `{success:false, error:'No street view images found in …'}` with **no status**, i.e. HTTP 200. Every other failure in the repo carries a status. Should be 404 (region has no usable coverage) or 503. `GameClient` only checks `data.success`, so this is invisible today — which is exactly why it will be missed when someone adds a `response.ok` check or a retry policy.
- **500 for a non-server error.** `new-game/route.js:157` maps a Mapillary network failure to 500; `daily/route.js:54` returns 500 when the upstream image cannot be resolved. Both are upstream failures → 502/503, which also keeps them out of the app's own error budget. `debug/pano/route.js:27` already gets this right (502).
- `new-game/route.js:152` calls `error.message.includes(...)` unguarded — a thrown non-Error (or one with no message) turns the error handler itself into a TypeError. Use `String(error?.message ?? '')`.
- **No player data in logs** — `guess/route.js:159-167` deliberately logs region/distance/score/hit with no name and no coordinates, and the comment says so. Verified: `stats.js` stores only a HyperLogLog, `player-id.js` never logs. One caveat: `new-game/route.js:125` logs `Session <uuid> created in <district>` — that is the answer's district keyed by session id, in the platform log. Harmless today (logs are not player-reachable) but it is the only place the pre-guess secret is written outside Redis; drop the region or log only at debug level.
- `debug/pano/route.js:27` returns `error.message` to the caller, which for an upstream failure is `"<status>: <200 chars of Mapillary's body>"` (`mapillary.js:52`). The route is closed in production but open in preview deployments; return a fixed string and keep the detail in the log.
- Per-round `console.log` on every guess and every new-game is fine at current volume; worth remembering against the free-tier concern already tracked.

## 3. Prioritized refactors

| # | Item | Effort | Risk | Ships alone? |
|---|---|---|---|---|
| 1 | `new-game` no-coverage response: give it a status (2.7) | S | low | yes |
| 2 | `GameClient` drops `gameResult.partial` — a partly-written round shows the success message (`GameClient.js:346-358` vs `RoundResultDialog:358`) | S | low | yes |
| 3 | Test `scripts/lib/assign-districts.mjs` (2.4) | M | none | yes |
| 4 | Delete the dead alias/rank/leaderboard fields + `submitScore` + `zScore` + `indexedProvinces` + `isDay`, update `helpers.js` and `leaderboard.test.js` in the same commit (2.2, 2.6) | M | low — nothing reads them, but it is one atomic contract change | yes, must be one commit |
| 5 | `scripts/lib/env.mjs`, incl. the unquoting fix (D1) | S | low | yes |
| 6 | Upstream failures → 502/503; guard `error.message` (2.7) | S | low | yes, with #1 |
| 7 | `DryPoolError` instead of message matching (2.3) | S | med — three throw sites and two matchers must move together | yes |
| 8 | Fold the score/distance fan-out into one primitive (2.2) | M | med | after #4 |
| 9 | One draw primitive for `pickRandomPano`/`pickPanoBySeed` (2.3) | M | med — changes the daily's pick if province ordering shifts | after #8 |
| 10 | `tolerate()` + `api-error.js` + `withPlayerCookie` (D2/D3/D4) | M | low | yes |
| 11 | Hoisted `vi.mock` → `setupFiles`; `MAPILLARY_ACCESS_TOKEN` into config env (D5/D6) | M | low | yes |
| 12 | Strip catch-log-rethrow (D7) | S | low | yes |
| 13 | `REGIONS` config → `scripts/lib/region-config.mjs`; `data:rebuild` script (2.4) | M | low | yes |
| 14 | Add `daily.js` to the client-safety `FORBIDDEN` list; e2e stub key-set gate; `/api/daily` stub (2.5) | M | low | yes |
| 15 | Docs: add `geo-search.js` and the three `scripts/lib` modules (2.6) | S | none | yes |

**No rewrite is warranted.** The two candidates — `leaderboard.js` and `build-region-boundaries.mjs` — are both better served by extraction (#8, #13) than replacement: the first carries several hard-won invariants (untrimmed score boards, `allSettled` after session consumption, the `:`-free username coupling) that a rewrite would re-litigate, and the second is a one-shot offline builder whose complexity is inherent to OSM geometry.

## 4. Unresolved questions

1. `submitScore` is documented as existing "for tests and backfills" — is there a real backfill procedure that uses it, or is the test suite the only client? (#4 assumes the latter.)
2. `getLeaderboard(type)` is still a string switch; is a future `type` planned (e.g. streaks), or can the distance board become its own function?
3. Is `/daily` deliberately out of the e2e lane for now, or an oversight?
4. Daily rounds still credit `recordRound('daily', …)` on every `/api/guess`, and `/api/daily` mints unlimited sessions — board credit is correctly skipped (`guess/route.js:135-141`), but the daily row in `npm run stats` remains inflatable. Accept as cosmetic, or gate?
5. Should the `/api/guess` per-round `console.log` stay at production volume?
