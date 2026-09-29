# Backend/API review: `dev` at cca6018 (2026-09-29)

Read-only review of the API routes, the server libraries, the scripts and the
CI config. It covers the commits since the whole-project review
(`77654d2..HEAD`: 04925cf, db8d799, 4d25a82, b8b4ffb, cca6018). Nothing listed
in that review's Resolution section is reported again.

## Scope
- Routes: `src/app/api/{daily,guess,leaderboard,new-game,skip}/route.js`, `debug/{pano,region-coverage}/route.js`
- Libs: session, game, leaderboard, upstash, pano-index, pano-db, daily, daily-calendar, daily-progress,
  pano-history, mapillary, errors, region-request, region-locate, debug-access, stats, cookies, player-id, username
- Scripts: `scripts/*.mjs`, `scripts/lib/*.mjs`. Config: `next.config.mjs`, `docker-compose.yml`, `.github/workflows/*`
- Gates run: `npm run lint` passes with 0 problems. `npm test` passes 33 files and 409 tests in 25 s.

## Overall assessment
The core invariants hold, and I traced each one in source:
- The session is claimed with DEL before any write (`guess/route.js:125`).
- Every round mints a fresh session id (`new-game/route.js:98`, `daily/route.js:26`).
- UUIDs are checked before an id reaches the keyspace (`guess/route.js:70`, `skip/route.js:13`).
- The district is not written to logs or responses before the guess.
- The daily round credits no board (`guess/route.js:138-155`).
- The debug routes are closed in production (`debug-access.js:21-32`).

What remains is concentrated in one place: the daily's rule for "the image is
gone" is defined by elimination, so it can still move the day to a second
panorama. That is the failure 04925cf set out to close. Behind it are two
resilience gaps in the backing-store clients and a few smaller convention and
dead-code items.

## Findings, highest severity first

### 1. MEDIUM, CONFIRMED (code path): the daily can still move to a second panorama after a single one-off failure
- **Where:**
  - `src/lib/daily.js:37-39` (`imageIsGone`), `daily.js:52-60` (cached path), `daily.js:68-86` (draw loop)
  - `src/lib/mapillary.js:64` (the `response.json()` call has no error wrapper) and `:77` (plain `Error`)
- **Cause:** `imageIsGone(error)` is defined as "not auth and not transient". Anything that is not a 401, a
  timeout, a network error, a 5xx or a 429 therefore counts as proof the image was deleted. That includes:
  - any other 4xx, for example 400 or 403;
  - a 200 whose body is not JSON, such as an HTML error page from a proxy. `response.json()` then throws a
    `SyntaxError`, not an `UpstreamError`;
  - the plain `Error('image has no usable thumbnail')`;
  - Redis errors from `putJsonIfAbsent` or `getJson` at `daily.js:78-81`. They sit inside the same `try`, so
    a Redis blip is logged as "candidate failed" and the loop moves on to another seed.
- **Failure scenario:**
  1. The cached pick is `c0`, which is candidate 0.
  2. One request gets a one-off 400, or a non-JSON 200, for `c0`.
  3. `daily.js:59` runs `DEL daily:{day}`, and `skip` becomes `{c0}`.
  4. Attempt 0 is skipped. Attempt 1 draws `c1`, Mapillary answers normally, and `SET NX` stores `c1`.
  5. Everyone before that request played `c0` and everyone after plays `c1`, under the same Daily #N.

  The test stub (`tests/daily-route.test.js:33-37`) only models a 404 ("gone") and a 503 ("flaky"), so no
  test covers this path.
- **Related (LOW):** the `del` at `daily.js:59` is unconditional. It can delete a pick that another instance
  wrote a moment earlier. Today this only converges because the seeded draw is deterministic, and that
  stops being true when warm instances hold different `countCache` values.
- **Fix, kept small:**
  - Require positive proof. Treat as gone only an `UpstreamError` with `code === 'http'` and a status of 400
    or 404, plus the missing-thumbnail case once it is given its own type. Everything else should throw.
  - Wrap `await response.json()` in `mapillary.js:64` so a parse failure becomes `UpstreamError('http', …)`.
  - Move `putJsonIfAbsent` and `getJson` (`daily.js:78-81`) out of the `try`, so Redis errors propagate
    instead of being classified.
  - Add tests: a single 400 on the cached pick should keep the pick and return 502, and a non-JSON 200
    should do the same.
  - Which status Mapillary returns for a deleted image is PLAUSIBLE only. Graph-style APIs often answer 400
    (code 100) rather than 404, so confirm it against the live API with one known-deleted id.

### 2. MEDIUM, PLAUSIBLE: Redis and Neon clients have no timeout, and best-effort calls get the full retry budget
- **Where:** `src/lib/upstash.js:42` (`new Redis({ url, token })`) and `src/lib/pano-db.js:28` (`neon(url)`).
- **Cause:** `@upstash/redis` retries network errors 5 times, with a backoff of `Math.exp(n) * 50` ms
  (per the Upstash docs). That adds about 4.3 s of backoff per failing command, and there is no request
  timeout. Neon's HTTP driver sets no timeout either.
- **Failure scenario:** during an Upstash network incident:
  - `/api/new-game` spends about 4.3 s on the best-effort history GET (`recentPanoIdsOrNone`) before the
    load-bearing session SET spends another 4.3 s and fails. That is roughly 9 s or more before a 500.
  - `/api/guess` loses about 4.3 s on the session GET alone.
  - A connection that hangs rather than resets has no cap. The platform kills the function, and the client
    gets a raw 504 instead of the `{success:false}` envelope.
- **Fix:**
  - Pass `retry: { retries: 1, backoff: () => 100 }` to the Redis client.
  - Pass a per-request `signal` if the installed 1.38.x supports it. I could not verify this because the
    `node_modules` reads are hook-blocked.
  - Give Neon `fetchOptions` with a timeout signal.
  - Keep the timeout under the draw budget.

### 3. LOW-MEDIUM, CONFIRMED: the draw budget does not limit the Mapillary request already in flight
- **Where:** `src/lib/mapillary.js:22-25`, `:51`, `:185`.
- **Cause:** each lookup gets a full `AbortSignal.timeout(5000)`, and the 8 s deadline is only checked after
  an attempt fails.
- **Failure scenario:**
  1. Attempt 1 times out at 5 s. That is under 8 s, so attempt 2 starts with another 5 s.
  2. The draw ends at about 10 s, before counting the Redis and Neon time spent earlier in the request.
  3. The comment on `:23-24` claims a 10 s function limit. No route exports `maxDuration`, so the real
     ceiling depends on project settings.
- **Fix:** pass the remaining budget down, for example
  `AbortSignal.timeout(Math.max(500, Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now())))`, by adding a
  timeout parameter to `fetchImage` and `fetchPanoramaById`.

### 4. LOW-MEDIUM, CONFIRMED: Vietnamese usernames with combining tone marks are rejected
- **Where:** `src/lib/username.js:46` and `:54`. This function is shared by the name modal and `/api/guess`.
- **Verified with node:**
  - `'Tiến'` in NFC passes.
  - `'Tiến'` in NFD fails.
  - `'Tiến'` (precomposed ê plus a combining acute) fails. That is the form the Windows Vietnamese
    keyboard and some IMEs emit.

  `\p{L}` does not match `\p{M}`.
- **Failure scenario:** a player in a game about Vietnam types their accented name and is told it may only
  contain letters.
- **Fix:** use `const value = raw.normalize('NFC').trim();`. This has a side benefit: two visually identical
  names can no longer become two board members.

### 5. LOW, CONFIRMED (the Neon cost is PLAUSIBLE): every draw pays for a linear OFFSET scan
- **Where:** `src/lib/pano-index.js:125-130`, `:155-160` and `:207-211`, with the index defined at
  `scripts/lib/pano-schema.mjs:235-236`.
- **Cause:** the `(province, id)` index removes the sort, but `OFFSET n` still walks n index entries. A Ha Noi
  draw reads an average of about 113k entries, and up to 226k. Two of the five provinces are that size, and
  a country round picks a province uniformly, so this is the common case on metered Neon compute. I did not
  run EXPLAIN against Neon.
- **Fix:** at seed time, write dense rank columns (`prov_rank`, `dist_rank`) with indexes
  `(province, prov_rank)` and `(district, dist_rank)`. Each draw then becomes `WHERE province=$1 AND
  prov_rank=$2`, which is O(log n). `pickPanoBySeed` uses the same lookup. The exclusion fallback at
  `:146-164` can keep its OFFSET, because it is rare.

### 6. LOW, CONFIRMED: two conventions for the same failure kinds
- **Where:**
  - `src/lib/mapillary.js:123-193` returns `{success, kind: 'dry'|'upstream'}`.
  - `src/lib/daily.js:88` and `pano-index.js` throw `DryPoolError` or `UpstreamError`.
  - The routes each map to statuses separately: `new-game/route.js:74-90` compares strings, and
    `daily/route.js:51-55` uses `instanceof`. The comment in `daily/route.js` says "the same mapping as
    /api/new-game".
- **Conflict:** `docs/development.md` says "a library function throws" and "failure kinds are classes".
- **Fix:**
  - Have `fetchRegionPanorama` throw `DryPoolError`, or `UpstreamError('http', …)` for an exhausted budget.
  - Export one `drawFailureStatus(error)` helper (404, 502 or 500) from `errors.js`.
  - Use it in both routes.

### 7. LOW, CONFIRMED: a stale comment invites someone to bring back the daily farm
- **Where:** `src/app/api/daily/route.js:15-18` says the daily round "credits the boards once". The code does
  the opposite (`guess/route.js:134-155`), as do `lib/daily.js:17-21` and `docs/features.md:198-202`.
- **Risk:** a maintainer who believes this comment and "fixes" the guess route would reopen the known
  +5-per-two-requests farm.
- **Fix:** reword the comment to "scored and counted, never credited".

### 8. LOW, PLAUSIBLE: a region code in the table is not checked against the deployed tree until after the claim
- **Where:**
  - `new-game/route.js:106` and `daily/route.js:31` store `regionCode` straight from the `panoramas`
    row.
  - `guess/route.js:125` consumes the session.
  - `leaderboard.js:207` (`requireRegion`) and `publicRegion()` (`region-request.js:74`) then throw.
- **Failure scenario:** the region tree is regenerated with a district renamed or split, and deployed before
  the reseed. From then on, every round in that district loses its session and returns a 500, and nothing
  can be retried. The seed gate (`pano-artifacts.mjs:302-306`) only checks the tree at seed time.
- **Fix:** in the draw, treat `!isRegion(candidate.regionCode)` as a failed candidate, and log it loudly. That
  way the problem surfaces before any session exists.

### 9. LOW, CONFIRMED: the district-assignment gate runs after the files are already written
- **Where:** `scripts/assign-pano-districts.mjs`:
  - `:104` rewrites the artifacts and `:220` rewrites `counts.js`, both before the stranded-rate gate at
    `:235`.
  - A partial run exits at `:209`, before the gate runs at all.
- **Effect:** a failed run leaves rewritten artifacts and a `counts.js` that can be committed, so client
  playability is already updated. The seed's per-province gate (`pano-artifacts.mjs:297-300`) still refuses
  the upload, so this is not a data-serving bug.
- **Fix:** compute everything, run the gate, then write.

### 10. LOW, CONFIRMED: dead code left from the previous review's list
The previous review named these as dead surface, but they are missing from its Resolution section.
- `countPanos`'s country branch (`pano-index.js:45-49`) is only reached from `tests/pano-index.test.js:50-51`.
  No production caller passes `'VN'`.
- `MAX_PER_CITY = Infinity` and its shuffle-and-cap branch (`build-pano-index.mjs:52` and `:215-223`) can
  never run.

### 11. LOW: hardening that is not a defect today
- `debug-access.js:25` compares the debug key with `===`. Use `crypto.timingSafeEqual` over equal-length
  buffers. The risk is small over the network, but the fix is two lines.
- The Mapillary token is sent in the query string (`mapillary.js:46`, `build-pano-index.mjs:89`). The Graph
  API also accepts an `Authorization: OAuth <token>` header, which keeps the token out of any URL an
  intermediary or future fetch log records. Whether the tiles host accepts the header is PLAUSIBLE only.
- The Nominatim `fetch` has no timeout (`build-region-boundaries.mjs:117`). A hung request stalls the
  offline build indefinitely.
- `session.js:19-22`, `:35-38` and `:55-58`, and `leaderboard.js:123-126`, log and then rethrow, and every
  route logs the same error again. This is noise only.

## Verified non-issues
- **Session races:** DEL-claim before any write, and fresh ids on both round routes. The old sessionId-reuse
  race is closed (`new-game/route.js:95-98`).
- **Daily day boundary:** the offset is a fixed +7 h, and Vietnam has no DST. Rollover checked with node:
  16:59:59Z gives 2026-09-29 and 17:00:00Z gives 2026-09-30. Stats stay on UTC days, which is documented.
- **Concurrent daily picks:** `SET NX` plus the read-back of the winner (`daily.js:78-81`) converges.
- **Answer exposure before the guess:** the round responses carry only `imageData.{url,isPano}` and the
  picked region. The logs omit the district and the coordinates (`new-game/route.js:117-119`,
  `guess/route.js:164-172`). The CDN-URL image id is an accepted risk, and I have not reported it.
- **Input validation:**
  - coordinates via `toCoordinate` plus finiteness and range checks;
  - usernames by a pattern that excludes `:`;
  - `limit` clamped in the library (`leaderboard.js:90`);
  - the debug `id` must be numeric;
  - the bbox must be finite.

  With the debug id numeric and every other outbound host fixed, there is no SSRF path. No route trusts
  `x-forwarded-*` or any other client header except the debug key.
- **Cookies:** `httpOnly`, `sameSite=lax`, and `secure` in production. Duplicate cookies are filtered through
  `isUuid`.
- **Envelope:** every route returns `{success:false, error}` with a real status: 400, 404, 405, 500 or 502.
- **Backup workflow:** an empty `KEY_PREFIX` secret falls back to the default (`upstash.js:47`). An empty
  export fails the job (`export-leaderboards.mjs:25-28`). Both workflows run with `contents: read`.

## Recommended actions (in order)
1. Classify "gone" by positive proof in `daily.js`, wrap `response.json()`, move the Redis calls out of the
   `try`, and add the one-off-400 and non-JSON tests (Finding 1).
2. Set client timeouts and a small retry budget for Upstash and Neon (Finding 2), and pass the remaining
   draw budget into the Mapillary fetch (Finding 3).
3. Normalize usernames to NFC (Finding 4).
4. Throw typed errors from `fetchRegionPanorama` and share one status mapper (Finding 6). Fix the stale
   daily comment (Finding 7).
5. Next time the pipeline is touched: rank columns for the draw (Finding 5), gate before write
   (Finding 9), delete the dead branches (Finding 10), and reject unknown region codes at draw time
   (Finding 8).

## Metrics
- Type coverage: JSDoc only, with no checker, by project policy.
- Tests: 409 passing. The Mapillary stub models only 404 and 503 responses.
- Lint: 0 problems.

## Unresolved questions
- What does Mapillary's Graph API return for a deleted image: 400 (code 100) or 404? Finding 1's fix depends
  on the answer.
- Do Vercel preview deployments share production Redis and Neon, and is Deployment Protection on? The debug
  routes are open on preview by design (`debug-access.js:30`).
- What `maxDuration` does the Vercel project actually run with? It decides how serious Findings 2 and 3 are.
