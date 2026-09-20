# Codebase Health Scan — VNGeoGuessr

Date: 2026-09-20 · Scope: whole repo (src/lib, src/app/api, scripts, tests, config) · Mode: brainstorm input, not PR review

## 1. Health summary

- Gates green: `npm test` 20 files / 292 tests passed (13s); `npx eslint .` 0 errors, 20 warnings (13 `react-hooks/set-state-in-effect`, 7 `react-hooks/refs` — all the established localStorage-in-effect / callback-ref patterns); `npm run build:check` compiled, 101 static pages, 5 dynamic API routes.
- Note: a local `npm install` was needed first — the checked-out `node_modules` was still on next@15.5.18 while `package.json`/lockfile want 16.3.3. Lockfile is committed and unchanged by the install.
- Server core (session claim-by-DEL, region-from-session scoring, pano-history boundary) is genuinely careful and well commented; the weak spots are at the edges: no rate limiting anywhere, no server-side username validation, three unauthenticated debug routes that spend Neon compute and the Mapillary token.
- Biggest structural risk is not a bug: the score leaderboard silently resets any player outside the top 200, so once 200th place exceeds 5 points the board is closed to new players forever.
- No CI (`.github/` absent), no backup path for the only durable player data (Upstash), ~27 Redis commands per completed round against a 500K/month free plan.

## 2. Findings

### High

**H1 — Score board is a closed ratchet: players outside the top 200 can never accumulate**
`src/lib/leaderboard.js:130-154`. `creditScore` reads the member's current score, writes `existing + points`, then `zRemRangeByRank(key, 0, -(201))` trims everything below rank 200. A player whose new total lands below the 200th place is deleted from the set, so the *next* round reads `zScore → null` and starts from 0 again. Their ceiling is one round's points (max 5) forever. Once the 200th entry holds more than 5 points, no new player can ever enter the national board; the `trimmed` flag only tells the UI to hide the number, it does not preserve the total.
Fix: keep totals in a separate hash/key (or a second unbounded zset) and use the trimmed zset purely as a display window; or drop the trim and rely on `zrange 0..limit` for reads (200 members × ~3 boards per region is small). Effort: M.

**H2 — No rate limiting on any route**
`src/app/api/new-game/route.js`, `guess/route.js`, `skip/route.js`, `leaderboard/route.js`, all three `debug/*` routes; no `middleware.js` exists, and grep finds no ratelimit dependency. One scripted loop costs a Mapillary lookup, a Neon query and ~27 Redis commands per iteration, all billed to free tiers, and can flood any board with submissions. Upstash free is 500K commands/month → ~18.5K rounds/month before the quota is the outage.
Fix: `@upstash/ratelimit` sliding window keyed on the existing `vng_pid` cookie plus IP, applied in a `middleware.js` over `/api/*`, with a tighter bucket for `/api/debug/*`. Effort: M.

**H3 — `/api/guess` accepts non-finite coordinates and consumes the session before it can fail**
`src/app/api/guess/route.js:41-53` validates only `Math.abs(x) > 90/180`; `Math.abs(NaN) > 90` is false, so `guessLat: "abc"` passes. The session is then deleted at line 79, `calculateDistance` returns `NaN`, and `submitRoundScore` rejects it at `src/lib/leaderboard.js:246` → 500. The player loses the round with no score and no way to retry.
Fix: add `if (!Number.isFinite(numGuessLat) || !Number.isFinite(numGuessLng)) return 400` (and the same for the target read from the session) before the `deleteGameSession` call. Effort: S.

**H4 — Username is validated only in the browser**
Only `src/app/components/UsernameModal.js:54` enforces `2-20` chars of `[a-zA-Z0-9_-]`. `src/app/api/guess/route.js:13` checks presence and nothing else, then `username.trim()` becomes a Redis sorted-set member (`src/lib/leaderboard.js:135`). Consequences: arbitrary-length members inflate a 256 MB free-tier store; a non-string (`username: 123`) throws inside `.trim()` → 500; a `:` in the name corrupts the distance board, whose entries are packed as `username:distance:timestamp` (`leaderboard.js:313`) and split back on every `:` at `leaderboard.js:99` (`distance` becomes `NaN` for the reader).
Fix: one exported validator in `src/lib/username.js` (`isValidUsername`) called by both the modal and the route; reject with 400 on failure. Effort: S.

### Medium

**M1 — Lost update on concurrent scoring for one name**
`src/lib/leaderboard.js:132-135` is a read-modify-write (`zScore` then absolute `zAdd`). Two rounds finishing at the same instant under one username (two tabs, or a shared name) lose one of the increments. Redis has an atomic primitive for exactly this.
Fix: add `zIncrBy` to `src/lib/upstash.js` and use its return value as the new total; drops a command per level as a bonus. Effort: S.

**M2 — Unauthenticated debug routes spend metered resources**
`src/app/api/debug/region-coverage/route.js:36-39` accepts `limit` up to 40,000 and runs `row_number() OVER (ORDER BY lat, id)` over a province partition (225,966 rows for HN) on Neon compute, per request, with no auth and no `NODE_ENV` gate; the bbox filter at `src/lib/pano-index.js:182` has no supporting lat/lng index, so it is a partition scan. `src/app/api/debug/mapillary/route.js` is an open proxy that burns the project's Mapillary token on any caller-supplied bbox, with no `AbortSignal` timeout (unlike `src/lib/mapillary.js:267`), and `src/app/api/debug/pano/route.js:89` turns any image id into coordinates. The coordinate exposure is a decision already accepted; the *cost* dimension is the part worth revisiting.
Fix: gate `/api/debug/*` behind a shared-secret header or `process.env.VERCEL_ENV !== 'production'` in one `middleware.js`; add a lat/lng index if the coverage page stays public. Effort: S.

**M3 — `/api/debug/mapillary` is dead weight contradicting a documented decision**
`src/lib/mapillary.js:228-234` records, with measurements, that `/images?bbox=` fails in every dense district and must not be reintroduced. `src/app/api/debug/mapillary/route.js` is that exact call, still shipped, still holding the only route that returns `error.message` to the client unconditionally (line 103) while every other route gates details on `NODE_ENV`.
Fix: delete the route and its `/debug/bbox` page, or move it behind M2's gate. Effort: S.

**M4 — Client-supplied session id becomes a Redis key with no validation**
`src/app/api/new-game/route.js:55,101`: whatever `?sessionId=` contains is used verbatim as `session:<value>`. `src/lib/player-id.js:462` validates the *cookie* id against a strict UUID pattern and documents precisely why ("a hand-crafted cookie must not smuggle a glob, a colon or an unbounded string into the keyspace") — the session id, which reaches the same keyspace from a plainer channel, gets none of that.
Fix: apply the same UUID test; mint a fresh id when it fails. Effort: S.

**M5 — Per-round Redis command budget is ~27**
new-game: history GET, session SET, history GET+SET = 4. guess: session GET, DEL, `submitRoundScore` 3 levels × (ZSCORE, ZADD, ZREMRANGEBYRANK, ZREVRANK) = 12, `submitDistanceRecord` 3 × (ZADD, ZREMRANGEBYRANK, ZRANK) = 9 → 23. Against 500K commands/month that is ~18.5K rounds/month, and the two fan-outs are awaited sequentially at `src/app/api/guess/route.js:89-90`.
Fix: `zIncrBy` (M1) removes 3; trim probabilistically (1-in-N writes) instead of on every credit, removing up to 6; run the two fan-outs in one `Promise.all`; batch a level's calls through the SDK pipeline to cut HTTP round trips. Effort: M.

**M6 — No backup or export for leaderboard data**
The migration/export scripts were deleted in `7212b67`; `.gitignore` still carries the `leaderboard-backup-*.json` rule for tooling that no longer exists. Upstash free has no scheduled backups, so an accidental flush or a lapsed database loses every board permanently.
Fix: a `scripts/export-leaderboards.mjs` using the existing `scanKeys` adapter, run manually or from a scheduled GitHub Action. Effort: S.

**M7 — `three.js` ships in the game route's first load**
`src/app/components/GameClient.js:6` statically imports `PanoramaViewer`, which statically imports `@photo-sphere-viewer/core` (`PanoramaViewer.js:5`). The build produces a single 624 KB chunk containing three.js (`WebGLRenderer`, 55 `THREE` references) — the largest client chunk by 3×. Leaflet is already handled correctly via `dynamic()` in `GuessMapPanel.js:8`.
Verified non-issue while here: `@turf/turf` is imported namespace-wide by `src/lib/game.js`, which client components import, but it tree-shakes out — no turf markers in any client chunk.
Fix: `dynamic(() => import('./PanoramaViewer'), { ssr: false })` so the shell and the guess map paint before the viewer downloads. Effort: S.

**M8 — Random draw is an `OFFSET` scan**
`src/lib/pano-index.js:123-143` picks with `ORDER BY id OFFSET random(0..total) LIMIT 1`. The `(province, id)` index (`scripts/lib/pano-schema.mjs:28`) makes it index-only, but it still walks ~113K entries on average for Ha Noi, per draw, up to 8 draws, on metered compute.
Fix: keyset draw — `WHERE province = $1 AND id > $2 ORDER BY id LIMIT 1` with a random id and wraparound — turns it into a log-n seek. Effort: M.

### Low

- **L1** `src/app/api/guess/route.js:93-102` logs username plus exact target and guess coordinates for every submission. Gameplay-identifiable data in Vercel logs, and log volume scales with play. Consider logging distance and region only. Effort: S.
- **L2** `src/app/api/debug/region-coverage/route.js:54` has no `try/catch`; a Neon failure becomes an unhandled rejection rather than the structured `{success:false}` every other route returns. Effort: S.
- **L3** `src/app/api/guess/route.js:31` dereferences `session.exactLocation` unguarded; a malformed session row is a 500 instead of a 400. Effort: S.
- **L4** `src/lib/mapillary.js:264` and `debug/mapillary/route.js:46` put the access token in the query string, where it lands in any intermediary's request logs. Mapillary accepts `Authorization: OAuth <token>`. Effort: S.
- **L5** `src/lib/pano-index.js:46` counts the country by awaiting each province in a sequential loop; it is cached per process, but a cold start pays 5+ serial round trips. `Promise.all` is a one-line change. Effort: S.
- **L6** Dependency drift is small (`next` 16.3.3→16.3.5, `react` 19.2.8→19.3.0, `lucide-react` 1.37→1.47, `@playwright/test`, `@upstash/redis`, `globals`, `tailwind-merge` all one patch/minor behind). Majors available and intentionally held by `^`: `@vercel/analytics` 2.0.1, `@vercel/speed-insights` 2.0.0, `eslint` 10.11.0, `vitest` 5.0.1. Effort: S.
- **L7** `/api/skip` (`skip/route.js`) and `/api/leaderboard` have no route-level tests; `debug/pano` and `debug/mapillary` have none at all. The four tested routes are new-game, guess, region-coverage. Effort: S.

## 3. Improvement ideas beyond bug fixes

1. **CI that runs the gates.** There is no `.github/` at all, so `lint`, `test` and `build:check` only ever run when someone remembers. A single workflow on push/PR (node 24, `npm ci`, the three commands) is the cheapest durable quality win in the repo, and it is the natural home for a scheduled leaderboard export (M6).
2. **One `middleware.js` as the API edge.** Rate limiting (H2), debug gating (M2) and a `Cache-Control` policy for `/api/leaderboard` all want the same seam, and none of them exist today. Building it once is less work than three route-local versions.
3. **Observability with a budget lens.** The free-tier ceilings (Upstash commands, Neon compute-hours, Mapillary quota) are the real availability risk, and nothing counts them. A tiny counter — Redis commands per round, Mapillary failures, Neon draw latency — logged once per round in a parseable line would turn "the game broke" into "we crossed a quota on the 14th".
4. **Make the leaderboard model explicit.** H1 forces the question the code never answers: is the board cumulative career points, best-of-N, or a rolling season? A weekly/monthly reset key (`leaderboard:vietnam:2026-W38`) solves the closed-ratchet problem, gives returning players something to climb, and bounds key growth by design instead of by trimming.
5. **Anti-cheat proportional to the threat.** Today the honest defence is "the pano id is not in the response" while `/api/debug/pano` resolves any id to coordinates. Either close the debug surface (M2) or accept it and stop paying for the secrecy elsewhere — the middle state costs complexity without buying the property.
6. **Data pipeline freshness.** The index is a point-in-time snapshot (`pano_provinces.generated_at`); deleted Mapillary images surface only as round retries (`src/lib/mapillary.js:347`). A scheduled job that samples N random rows per province, counts 404s and reports a staleness ratio would tell you when to reseed instead of guessing.
7. **Component-level test coverage.** All 292 tests are lib/API level; `GameClient.js` is 609 lines of epoch/ref race handling verified only by Playwright stubs. A handful of React Testing Library tests over `applyRound`/epoch supersession would cover the part most likely to regress.
8. **Split `GameClient`.** At 609 lines it owns round loading, prefetch, audio, submission, the result dialog and navigation. The seams already exist in the refs (`roundEpochRef`, `appliedEpochRef`); extracting a `useRound()` hook would make the concurrency logic testable in isolation.

## 4. Top 3 recommendations

1. **Fix the leaderboard ratchet (H1) and decide the board's model.** It is the only finding that changes what players experience every day, and it silently caps the game's growth: with a full top 200, every new player's score is deleted after each round.
2. **Add `middleware.js` with rate limiting and a debug gate (H2 + M2).** Unmetered routes over three free tiers is the most likely cause of a real outage, and it is one file.
3. **Stand up CI (idea 1) and close the input-validation gaps it cannot see (H3, H4, M4).** The gates are green and the repo has no way to keep them that way; the three validation fixes are an hour's work and remove two 500-class failures and a Redis-key trust gap.

## 5. Unresolved questions

- Does the Mapillary `thumb_2048_url` served to the client embed the image id? If it does, `/api/debug/pano` turns the live round's image URL into the answer coordinates in one request, and the "pano id stays server-side" comment in `new-game/route.js:127` buys nothing. One round of manual inspection settles it.
- Is the top-200 trim intended as a display window or as real data retention? The fix for H1 depends on the answer.
- Are the three `/api/debug/*` routes meant to stay publicly reachable in production, or was that only ever true of the coverage page?
- What is the actual play volume? The 500K/month Upstash budget is ~18.5K rounds; whether M5 is urgent or theoretical depends on a number only the maintainer can see.
- Is `/api/skip` ever called by anything other than the client's unload path? It deletes any session id with no ownership check, which is fine for UUIDs but not if the id space ever changes (M4).
