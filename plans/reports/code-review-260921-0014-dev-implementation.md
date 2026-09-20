# Code review — `dev` implementation rollout (main...dev)

Scope: `git diff main...dev -- src scripts tests .github package.json`, 66 files,
+2424/-803. Commits 3314da1, e649259, 8450b75, 6dbe2e0, 064c173.

## 1. Gates

| Gate | Result |
|------|--------|
| `npm run lint` | pass — 0 errors, 21 warnings, all pre-existing `react-hooks/*` in files outside and inside the diff alike (`use-count-up.js` untouched) |
| `npm test` | pass — 28 files, 348 tests |
| `npm run build:check` | pass — 101 pages; `/` and `/daily` static, `/api/daily` dynamic |
| e2e | not run (headless ARM64, no browser) — two specs reviewed by reading, see F6 |

## 2. Findings

### Blocker

**B1 — the daily challenge is an unlimited leaderboard-farming loop.**
`src/app/api/daily/route.js:18-46` mints a fresh `crypto.randomUUID()` session on
every call with no per-player check, and the panorama is the same all day by
design. `src/app/api/guess/route.js:122-126` scores that session like any other,
so `submitRoundScore` credits the district, province and country score boards
(`src/lib/leaderboard.js:137-154`), which are now permanent (never trimmed). The
first submit returns `gameResult.exactLocation` (`guess/route.js:170-173`), so the
loop is: `GET /api/daily` → `POST /api/guess` with the coordinates just learned →
+5 points on three boards, repeatable for two HTTP requests, all day.
Ordinary rounds are immune: `/api/new-game` draws a random panorama and never
returns its id or coordinates, so a replay cannot be aimed.
The rationale at `src/lib/daily.js:15-19` ("no daily leaderboard… the only person
a second attempt cheats is the player") holds only if the daily credits no board.
It credits the main ones. This is not the accepted browser-only-attempt decision;
it is a premise of that decision that the code does not satisfy.
Fix: in `guess/route.js`, skip both fan-outs when `session.mode === 'daily'` and
record stats only — that matches "no daily leaderboard" exactly. Alternative: a
server-side `SET daily:credited:{day}:{playerId} NX` gate before crediting.

### Should-fix

**S1 — `stats:players:{day}` can be created with no TTL and live forever.**
`src/lib/stats.js:56-68`. The HLL's EXPIRE is gated on `count === 1` from the
*hash* increment. If the day's first recorded round arrives without a player
cookie (cookie-blocked browser, ITP), that round consumes `count === 1`; the next
round with the same `level:score` field and a playerId creates the HyperLogLog at
`count === 2`, so `expire` never runs. One permanent key per affected day, against
a 256 MB free tier. `tests/stats.test.js:51` only covers the playerId-first order.
Fix: EXPIRE the players key when `pfAdd` itself reports a new member
(`if (await pfAdd(...)) await expire(...)`) — distinct players per day are few, so
the extra command is negligible and always covers key creation.

**S2 — home page hydration mismatch on the daily number, every day after deploy.**
`src/app/components/DailyCard.js:39`: `state?.number ?? dailyNumber(dailyDay())`.
`/` is statically prerendered (confirmed by `build:check`), so the HTML freezes the
build-day number, while the client's first render computes today's. From the day
after a deploy, every visitor hydrates `#N+1` over `#N`. `played` and `streak`
are correctly null-guarded; `number` is the one that is not, despite the comment
at lines 18-20 claiming the first paint matches the server.
Fix: derive `number` from `state` only and render a placeholder before mount.

**S3 — the daily replay path forces `isPano: true`.**
`src/app/components/GameClient.js:216`. `saveDailyResult` never stores `isPano`
(`src/lib/daily-progress.js:58-67`), so a flat daily image is re-rendered through
the three.js panorama viewer on revisit. Fix: store and restore `isPano`.

**S4 — a cached daily URL that stops resolving breaks the day with no lever.**
`src/lib/daily.js:32-36` returns the cached record unconditionally for 48 h; the
4-attempt retry loop runs only on a cache miss. If Mapillary's signed thumbnail
403s mid-day, every `/api/daily` keeps handing out the dead URL and the client has
no retry. The "valid for weeks" claim at lines 12-13 is asserted, not measured.
Fix: cache `{id, lat, lng, regionCode}` (the expensive, deterministic part) and
re-resolve `url` per request — one Mapillary call per player, which is what every
non-daily round already costs.

**S5 — `/api/guess` can credit boards and still answer 500.**
`guess/route.js:127-131`. `Promise.all` rejects on the first failing level, but the
sibling `zIncrBy` calls already in flight are not undone and the session is already
deleted, so a retry is impossible. The client then renders
`FAILURE_COPY.default` — "Nothing was scored" — for a round that partially scored.
`distanceOrNone` already applies the right pattern to the lesser record; the score
fan-out, which is the one that can half-succeed, does not.
Fix: catch around `submitRoundScore` and return 200 with what landed, or at minimum
a distinct `reason` so the dialog does not claim nothing was recorded.

**S6 — board rows in the result dialog are still English; the e2e stub says otherwise.**
`src/lib/leaderboard.js:145` and `:284` set `name: getRegion(code).name`, rendered
at `RoundResultDialog.js:303` and `:325`. Everything else on that screen is
Vietnamese via `regionName()`. `tests/e2e/helpers.js:55-56,62-63` was updated to
`'Quận 7'` / `'Hồ Chí Minh'`, so the stub now asserts text production does not
produce. Fix: `regionName(regionCode)` in both credit helpers.
(`src/app/api/leaderboard/route.js:33` has the same English `name`, but no client
reads it — cosmetic only.)

**S7 — `tests/e2e/home.spec.js:16` will fail against the new UI.**
It still expects `'Ha Noi'`, `'Da Nang'`, `'Lam Dong'`; `RegionPicker` now renders
`'Hà Nội'`, `'Đà Nẵng'`, `'Lâm Đồng'`. Only the TPHCM cases in that file were
updated. e2e is not in CI, so nothing caught it.

### Nit

- `tests/e2e/helpers.js:47` still emits `trimmed: false`; no producer sets it and
  no consumer reads it since the trim was removed.
- `src/lib/debug-access.js:31` keys off `VERCEL_ENV !== 'production'`, so any
  non-Vercel deployment is fully open. Correct for the stated Vercel-only target;
  a `NODE_ENV` fallback would make that not depend on the host.
- `GameClient.js:541-548` mounts two `ThemeToggle` instances and hides one with
  CSS; both run their localStorage effect. Works, costs a component.
- `pickPanoBySeed` (`src/lib/pano-index.js`) hashes the row offset as
  `${seed}:offset` without the province, so walking to a second province reuses the
  same offset. Deterministic and harmless, marginally less uniform.
- `ci.yml` triggers on `push: [main, dev]` *and* `pull_request`, so a dev→main PR
  runs all four gates twice per push.
- `leaderboard-backup.yml` uploads every board — all usernames — as a GitHub
  artifact. On a public repo those are publicly downloadable. Self-chosen
  pseudonyms only, so low, but it is player data leaving the boundary.
- `/api/daily` is unauthenticated and unrated like the rest of the API, and is now
  linked from the home page. Two Redis commands per call; the standing free-tier
  exposure, on a more visible URL.

## 3. Checked and found correct

- `/api/guess` validates body shape, username and both coordinates *before*
  touching the session; `toCoordinate` rejects `null`/`true`/`"abc"`.
- The session is claimed by `DEL` and scoring runs only for the request whose
  `deleteGameSession` returned true — concurrent double submit credits once
  (`tests/guess-route.test.js`).
- A malformed body returns 400 `invalid-request`, not 500; only an unusable stored
  target throws.
- The answer (`exactLocation`, resolved region) appears only in the post-guess
  response; `/api/daily` and `/api/new-game` return URL and `isPano` only.
- `zIncrBy` is atomic and halves the score fan-out to 2 commands per level.
- Score boards are no longer trimmed; `creditScore` always returns a number, and
  the dialog's `score === null` → "Below top 200" branch was removed with it.
- `getLeaderboard` clamps `limit` into `[1, 200]` and keeps `?city=` → country.
- `/api/skip` and `/api/new-game` both gate on `isUuid` before the value becomes a
  Redis key; `generateSessionId` mints a matching lowercase UUID.
- The skip race is fixed: `handleSkipGuess` passes `null`, never the id whose DEL
  is still in flight.
- `debugAccessAllowed` guards both surviving debug routes; `/api/debug/mapillary`
  is deleted; `region-coverage` now has an error boundary around the Neon calls.
- `locateRegion`/`regionHit` run after the session is consumed, change no score,
  and grade district / province / none correctly including province-level answers.
- Daily determinism: same seed → same panorama; a concurrent cold cache yields the
  same record from both workers, so the race is cost-only.
- Day rollover at UTC+7 is offset arithmetic on an epoch, not a local timezone;
  `nextStreak` / `currentStreak` extend, hold and break as documented, and a round
  straddling midnight correctly counts as the earlier day.
- Stats: field layout, `stats:????-??-??` SCAN pattern (cannot match
  `stats:players:*`), and `scripts/stats.mjs` arithmetic all line up.
- Redis fake: `hincrby`, `hgetall` (null when empty), `pfadd` (1 only when the
  estimate changes), `pfcount` (union), `expire` (0 on a missing key) and the
  non-string TTL bookkeeping all match Redis semantics.
- `regionName()` is applied everywhere a region is rendered except the two board
  rows in S6; 84 of 85 nodes carry `nameVi`, `VN` intentionally does not.
- `geo-search` keeps both spellings as aliases; `foldDiacritics` handles `Đ`.
- Fonts add the `vietnamese` subset; `metadataBase` and per-region OG are sound.
- `share.js` carries no coordinates, panorama id or resolved district.
- The OSM "explore" link renders only after a guess and `exactLocation` is in fact
  carried into the result object (`GameClient.js:350`).
- `validateUsername` is now the single rule for the modal and the route; `:` is
  excluded, which is what keeps the packed distance member parseable.

## 4. Merge recommendation

**Not ready.** B1 must be fixed before this reaches production — it turns the
permanent score boards into a two-request-per-5-points faucet. S1–S5 are worth
taking in the same pass; S6/S7 are small and make the e2e suite honest again.
Everything else is sound and the security direction of the change (debug gate,
shared username rule, UUID gating, atomic session claim) is a clear improvement.

## 5. Unresolved questions

1. Is crediting the main boards from the daily intended at all? If yes, B1 needs a
   server-side attempt gate; if no, skipping the fan-out for `mode === 'daily'` is
   both the fix and the simplification.
2. What is the actual lifetime of a Mapillary `thumb_2048_url`? S4's severity is
   "the day breaks silently" if under 24 h and "cosmetic" if genuinely weeks.
3. Is `tiennm99/vngeoguessr` public? That decides whether the backup artifact's
   usernames are world-readable.
