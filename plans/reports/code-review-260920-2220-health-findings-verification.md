# Verification of the codebase health scan (260920-2201)

Independent second pass. Branch `dev`, tree clean. Gates re-run here: `npm test` 20 files / 292 tests
pass; `npm run lint` 0 errors / 20 warnings; `npm run build:check` exit 0. No e2e (headless, no browser).
`node_modules/next/dist/docs/` is blocked by a tooling hook, so Next 16 conventions were checked against
nextjs.org docs for 16.3.5 instead.

## 1. Verdicts

| ID | Verdict | Evidence |
|----|---------|----------|
| H1 | CONFIRMED | `src/lib/leaderboard.js:132-138` read-modify-write then `zRemRangeByRank(key, 0, -201)`; `zScore` returns null for a removed member (`src/lib/upstash.js:117`), so the next round restarts at 0. Grep finds no second store of a total — `upstash.js:5-11` lists the whole keyspace, and only these zsets hold scores. `tests/leaderboard.test.js:73-92` proves trimmed members disappear entirely. |
| H2 | CONFIRMED | No `middleware.*` / `proxy.*` anywhere outside `node_modules`; no `vercel.json`; `next.config.mjs` sets only `env` and `distDir`; no ratelimit dependency in `package.json`. Nothing at the platform layer is configured in-repo. Caveat on the fix: Next 16 renamed the convention — the file is `proxy.js` (root or `src/`), exporting `proxy`; `middleware.js` is deprecated (nextjs.org file-conventions/proxy, v16.0.0 row). |
| H3 | PARTIAL — mechanism refuted | The input does pass validation (`Math.abs(NaN) > 90` is false, `src/app/api/guess/route.js:41-53`), but `calculateDistance` does **not** return NaN: turf rejects non-finite coordinates and `src/lib/game.js:16` rethrows (`Failed to calculate distance: coordinates must contain numbers`, reproduced locally). That throw is at route line 57, **before** `deleteGameSession` at line 79 — the session survives its 30-minute TTL and the player can retry. Real residual: a 500 where a 400 belongs. Severity is Low/Medium, not High. |
| H4 | CONFIRMED | Only `src/app/components/UsernameModal.js:37-58` validates; `guess/route.js:13` checks presence only, `:89` calls `username.trim()`. Non-string → TypeError → 500. `src/lib/username.js` exports no validator. A `:` in the name does corrupt the distance board: packed at `leaderboard.js:313`, split on every `:` at `leaderboard.js:99`. |
| M1 | CONFIRMED | `leaderboard.js:132-135` zScore→zAdd with an absolute score, no `zIncrBy` in `src/lib/upstash.js`. Two concurrent rounds under one name lose an increment. |
| M2 | CONFIRMED | `debug/region-coverage/route.js:36-39` clamps to 40,000 and runs `row_number() OVER (ORDER BY lat, id)` (`pano-index.js:201-208`) with no auth, no env gate; `scripts/lib/pano-schema.mjs:17-31` creates only `(province, id)` and `(district, id)` — no lat/lng index, so the bbox filter is a partition scan. `debug/mapillary/route.js:49-52` has no `AbortSignal` (contrast `mapillary.js:45`). |
| M3 | CONFIRMED (content), citations wrong | The "do not reintroduce bbox search" measurement is at `src/lib/mapillary.js:7-11`, not 228-234 — the file is 177 lines. `debug/mapillary/route.js:104` does return `error.message` unconditionally; every other route gates on `NODE_ENV`. |
| M4 | PARTIAL | Unvalidated: confirmed, `new-game/route.js:55,101` uses the raw `?sessionId=`. Impact is narrower than the cookie analogy implies — the key is always `<prefix>session:<value>`, so no escape into `history:`/`leaderboard:`. Residual: unbounded key length, glob characters in the keyspace (`scanKeys`), and overwrite of another player's live session when its id is known. The cited `player-id.js:462` does not exist; the UUID pattern is at `player-id.js:32`. |
| M5 | CONFIRMED (recount) | new-game 4 (`getRecentPanoIds` GET, session SET, `recordPanoId` GET+SET). guess 2 (GET+DEL) + 3 levels × 4 (`creditScore`: zScore, zAdd, zRemRangeByRank, zRevRank) + 3 × 3 (`creditDistance`: zAdd, zRemRangeByRank, zRank) = 23. Total **27** — but that is the district-leaf maximum; a pano with `district` NULL has 2 ancestors (`regions.js:96-104`) and costs 20. `/api/leaderboard` is only hit when the modal opens (`LeaderboardModal.js:41`), so it is not in the per-round budget. Sequential fan-outs at `guess/route.js:89-90`: confirmed. |
| M6 | CONFIRMED | `.gitignore:57` still carries `leaderboard-backup-*.json`; `7212b67` removed the scripts. |
| M7 | CONFIRMED (measured) | `.next-check/static/chunks/3isra0_-1-ejn.js` is 638,097 B (624 KB), 5 `WebGLRenderer` hits, 2.8× the next chunk (228,922 B). Referenced from every prerendered `.next-check/server/app/game/*.html`, so it is in the game route's first load. Static import chain: `GameClient.js:6` → `PanoramaViewer.js:5`. Leaflet is dynamic (`GuessMapPanel.js:8`). |
| M8 | CONFIRMED | `pano-index.js:118-133`: `ORDER BY id OFFSET $2 LIMIT 1` with a random offset, up to 8 attempts. |
| L1 | CONFIRMED | `guess/route.js:93-102` logs username + both coordinate pairs per submission. |
| L2 | CONFIRMED | `debug/region-coverage/route.js:54-55,76` await three DB calls with no try/catch. |
| L3 | CONFIRMED | `guess/route.js:31` dereferences `session.exactLocation` unguarded. |
| L4 | CONFIRMED (line wrong) | Token in the query string at `mapillary.js:42` and `debug/mapillary/route.js:47`, not 264. |
| L5 | CONFIRMED | `pano-index.js:43-46` sums provinces in a sequential `for … await` loop. |
| L6 | CONFIRMED exactly | `npm outdated`: next/eslint-config-next 16.3.3→16.3.5, react/react-dom 19.2.8→19.3.0, lucide-react 1.37→1.47, @playwright/test 1.62.1→1.63.0, @upstash/redis 1.38.3→1.38.4, globals 17.11→17.12, tailwind-merge 3.6→3.7; majors held: @vercel/analytics 2.0.1, @vercel/speed-insights 2.0.0, eslint 10.11.0, vitest 5.0.1. |
| L7 | CONFIRMED | Route tests exist only for new-game (×2), guess, region-coverage. `/api/skip`, `/api/leaderboard`, `debug/pano`, `debug/mapillary` appear only in `tests/e2e/`. |

## 2. Material issues the scan missed

1. **Skip races the next round onto the same Redis key.** `GameClient.js:373-381` fires `/api/skip`
   (session DEL) **without awaiting**, then line 394 calls `loadRound(region, currentSession, …)`, which
   re-uses the same id and SETs `session:<id>` again (`new-game/route.js:101-113`). Nothing orders the two
   requests. If the DEL lands after the SET, the fresh round's session is gone and the player's next guess
   gets `Session not found` (400) — a lost round with no client-side recovery. Await the skip, or skip with
   a fresh id.

2. **A failed submit can still have credited points.** `guess/route.js:89-90` runs two non-atomic fan-outs
   after the session is consumed. If `submitDistanceRecord` throws (Redis blip, `leaderboard.js:334-336`),
   the route returns 500 while the score fan-out has already written to three boards; the client then
   renders "the round was not recorded" (`GameClient.js:313-321`). No rollback, no idempotency key, and the
   session is gone so the state is unrecoverable. Same shape applies to a partial failure *within*
   `fanOutScore` — `Promise.all` at `leaderboard.js:169` leaves the succeeded levels written.

3. **Several of the scan's citations point past end-of-file.** `src/lib/mapillary.js` is 177 lines (cited
   228-234, 264, 267, 347), `src/lib/player-id.js` is 90 (cited 462), `src/app/api/debug/pano/route.js` is
   24 (cited 89). The underlying claims all hold, but the line references are unverifiable, and the build
   summary says "5 dynamic API routes" where the build prints 7 (plus `/game`). Treat the scan's evidence
   pointers as approximate.

4. **Body-parse failures are 500s, inconsistently.** `guess/route.js:9` and `skip/route.js:6` call
   `request.json()` bare — a malformed or empty body is an unhandled throw surfaced as 500. Only
   `new-game/route.js:166` guards with `.catch(() => null)`. External input at a trust boundary should
   produce a 400 everywhere, and the current shape inflates 500-rate alarms for ordinary bad requests.

5. **Distance records: weaker validation than the score path, plus a colliding member id.**
   `submitDistanceRecord` coerces with `Number(distance)` and never checks finiteness
   (`leaderboard.js:309`), unlike `submitRoundScore:246`; a non-finite value reaches `zAdd` as a score.
   The member id is `username:distance:Date.now()` (`:313`), so two records for one name in the same
   millisecond silently overwrite, and any `:` in the username (H4) breaks the reader at `:99`.

## 3. Corrected top 3

1. **H1 — the score ratchet.** Stands as the top finding. Note the cap is deliberate and tested
   (`tests/leaderboard.test.js:73-92`); what is missing is the durable total behind the display window.
   This changes the board's product model, so it needs the maintainer's decision (window vs. retention vs.
   seasonal key), not a unilateral fix.
2. **H2 + M2 — the unmetered abuse surface.** Still one seam, but in Next 16 it is `proxy.js`, not
   `middleware.js`, and the same docs recommend not relying on it alone — put the debug gate in the debug
   routes as well as the shared limiter.
3. **H4 + missed #2 — the write path's trust and consistency gaps.** Server-side username validation (a
   real 500 and real board corruption) plus idempotent/ordered scoring after session consumption. This
   displaces H3, which is materially weaker than reported: the bad input throws before the session is
   consumed, so it costs an error response, not a round.

## 4. Unresolved

- `node_modules/next/dist/docs/` could not be read (hook-blocked), so Next 16 judgements here rest on the
  published 16.3.5 docs.
- Whether `thumb_2048_url` embeds the image id (the scan's first open question) still needs a live
  response; it cannot be settled offline.
- Whether the top-200 trim is a display window or a retention policy remains a product decision.
