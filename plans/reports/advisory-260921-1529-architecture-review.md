# Architecture review: VNGeoGuessr `dev` (2026-09-21)

Advisory only; no code changed. Branch `dev` at 77654d2. Gates re-run here: 29 files, 357 tests pass in 24.5s. Recorded decisions (one ladder, untrimmed boards, no daily board, localStorage identity, debug gate, `nameVi`, pre-merger boundaries, `leaderboard:city:` prefix) are taken as given.

## TL;DR

The architecture is sound and does not need a rewrite anywhere. The seams that matter (server-only pano index, atomic session claim, adapter-owned key prefix, best-effort vs load-bearing writes) are in place and test-enforced. What has accumulated is *surface*, not structure: a guess response that carries three copies of the same data, pre-tree aliases kept "until the API moves to `levels`" when the client already moved, error classification by string-matching in eight places, and a 713-line `GameClient` that owns the round state machine, daily mode, prefetch and chrome. Do four small, independent refactors before the next feature (envelope slimming, typed error seam, dead-surface sweep, `GameClient` header/hook extraction). Do not: rewrite `GameClient` as a reducer, collapse the two stores, or centralise the test mocks.

## 1. Module boundaries

| Module | Leak | Verdict |
|---|---|---|
| `GameClient.js` (713 lines, 30 commits) | Round lifecycle (`applyRound`/`loadRound`/epochs, 158-199, 285-307), prefetch (319-331), daily replay + save (211-223, 360-367), username fallback (252-257), audio cues, storage, and ~80 lines of header JSX (501-583) in one component | **Extract, staged**: (a) `GameHeader` from 501-583, pure JSX; (b) `use-round.js` hook holding state, refs and handlers as they are (a move, not a redesign); (c) the daily branch becomes the hook's init path. No reducer rewrite (see §2). |
| `api/guess/route.js` | Validation (59-84), session claim (122-125), scoring (100-107), fan-out (135-141), locate (146-147), stats (151-157), response shaping (169-199). Ordered and commented; the only real leak is the envelope | **Refactor in place**: slim the envelope (§2). The sequence itself is the anti-cheat contract and reads better inline than split. |
| `leaderboard.js` | `fanOutScore` returns `district/province/global/city` aliases (189-202) and `submitDistanceRecord` the `*Distance` set (340-350) "until the API surface moves to `levels`" (199-200). It moved: `GameClient` reads `levels`/`distanceLevels` only (351-352). `submitScore` (218-237) has no `src` caller; its doc comment (207-211) still describes the retired regional ladder. `message` strings (231, 269-271, 351) are presentation built in the domain | **Refactor in place**: delete aliases, `submitScore`, and `message`; return `{ levels, partial }`. Tests: `tests/leaderboard.test.js` has 45 alias assertions to rewrite against a `byLevel(levels, level)` helper. |
| `region-request.js` vs `regions.js` | Clean: HTTP parsing/DTO (`resolveRegion`, `publicRegion`) vs tree navigation. Only smell: `?city=` fallback (31) for API fetch calls nobody bookmarks | **Leave**; drop the `city` fallback in the sweep (§3). |
| `upstash.js` | Pure adapter: primitives + prefix. The key catalogue comment (5-19) duplicates tech-stack.md "Key Namespaces" | **Leave**. Keep the catalogue in one place (docs), point the header at it. |
| `mapillary.js` | Draw + resolve; imports `pano-index.js`. Fine as the "get me a playable panorama" seam. Error typing by string (94, 168) | **Refactor in place** with the typed-error seam (§4). |
| `pano-index.js` / `pano-db.js` | Clean two-layer split; `countCache` self-heals on a stale count (131-139) | **Leave**. |
| `FirstRoundHint.js` | Direct `localStorage` (29, 34, 43) against the "one module owns one storage concern" convention every `src/lib/*` storage module states | **Refactor in place**: move the key to a lib module, or accept and codify the exception. |

## 2. Would a rewrite pay for itself?

**`GameClient` → `useRound()` reducer + thin components.** No. The hard part is not state shape, it is the epoch/`appliedEpoch`/`prefetchRef`/`mountedRef` dance (140-154) protecting against late fetches, late viewer `ready`, double-click on Radix exit, and skip-then-DEL races. A reducer does not remove any of those races; it moves them into action ordering, which is harder to reason about with async `await` in the middle. The 30-commit churn was UI layout (Safari grid, safe-area, header collapse), not lifecycle bugs. Cost: 1-2 weekend sessions plus the only verification is Playwright, which cannot run on this server. Payoff: testability of a state machine that is already stable. Do the staged extraction from §1 instead: same readability gain, near-zero behaviour change. Reconsider a reducer only when the 5-round run lands, because a run is a genuine second state machine layered over the round.

**API envelope.** Yes, and it is cheap. `/api/guess` returns `gameResult.levels` + `gameResult.distanceLevels` + four legacy ranks (187-190) + the whole `leaderboard` object (196) + the whole `distance` object (197). The client reads `gameResult.*` and `leaderboard.message` (GameClient 273, 357), rendered at `RoundResultDialog.js:363-365` as a sentence the dialog already shows structurally. `/api/leaderboard` emits `type`/`cityCode` (35-37) that `LeaderboardModal` never reads. Internal API, one consumer, e2e stub in `tests/e2e/helpers.js:41-75` is the other. Ship as one commit.

**Two stores → one.** No, under the constraints. Redis holds hot mutable per-player state; Postgres holds a 424k-row read-only index with SQL sampling for the coverage page. Folding the index into Redis (ZRANDMEMBER per region, GEOSEARCH for the debug map) is feasible on free tiers but is a provider change and rewrites `pano-index.js`, the seed, PGlite fixtures and the coverage route for zero player-visible gain. Folding sessions/boards into Neon adds scale-to-zero wake-ups (Free plan suspends after 5 min, cannot be disabled) to every first round after idle, and a TTL sweep the app does not need today. Cost of the split as-is: two env pairs, two fakes, two `vi.mock` blocks in route tests. Acceptable.

**Pipeline scripts.** No one-command rewrite. The four steps have different cost profiles (Nominatim 1 req/s; Mapillary 50k tiles/day; seed free) and the header comments say so. Two small fixes: `loadEnvFile`/`loadToken` is copy-pasted in `seed-pano-db.mjs:34-46`, `build-pano-index.mjs:467-480`, `export-leaderboards.mjs:739-750`, `stats.mjs:684-695` → `scripts/lib/env.mjs`; and add `data:refresh` = `data:panos && data:districts && data:seed`, the path a routine refresh actually takes (`data:repartition` already exists for the boundary-only path).

**Test harness.** Never. The 4-line `vi.mock` hoist appears in 14 files because Vitest requires it per file; the factory already lives once in `mock-upstash.js`/`mock-neon.js`. Vitest's docs say modules imported inside a setup file are not mocked (cached first), so a `setupFiles` centralisation is a trap. ~80 lines of boilerplate is the correct price.

## 3. Dead or legacy surface

- `gameResult.globalRank/cityRank/globalDistanceRank/cityDistanceRank` (guess 187-190); top-level `leaderboard`, `distance`, `message` (196-198). No client reader; only the e2e stub echoes them.
- `fanOutScore` aliases (leaderboard 196-201), `submitDistanceRecord` aliases (346-350), `submitScore` (218-237), `message` strings.
- `/api/leaderboard` `type` and `cityCode` (35-37).
- `?city=` fallback (`region-request.js:31`, tests `region-request.test.js:17-36`, `new-game-route.test.js:103`). API URLs are fetch calls, not bookmarks; the old client bundle is gone.
- `POST /api/new-game` session lookup "for debugging" (169-202): no caller in `src/` or e2e.
- `/game?region=` redirect (`game/page.js`): **keep**. It is a user-facing URL and 52 lines.
- `trimmed`: only `trimmedUsername` locals remain (leaderboard 322-336); nothing structural left.
- Two `ThemeToggle` instances by breakpoint (GameClient 550-555): recorded decision, matches `SoundToggle`; leave.
- `@radix-ui/react-tabs` in `package.json` with no `ui/tabs.jsx` and no import (package.json change: highlight for manual processing).
- Docs describing what code no longer does: `project-structure.md:103` (`tabs.jsx`), `tech-stack.md:61,69` and `development.md:100` ("leaderboard migration" tests, removed in 7212b67), `game-flow.md:142` (leaderboard "pagination": none exists), `development.md:106` ("well under a second": measured 24.5s, PGlite import dominates), `project-structure.md:171-172` lists 2 of 5 `scripts/lib` files.
- Doc/code contradiction: `development.md:24-27` says individual parameters apply "to React components"; every component destructures a props object (`GameClient({ region, daily })`, `RoundResultDialog({...})`). Amend the rule, not the code.

## 4. Robustness at the architecture level

| Failure | What happens today | Gap |
|---|---|---|
| Redis down | `new-game`: history tolerated (31-52) but `storeGameSession` throws → 500; message chosen by `error.message.includes('fetch')` (157) can say "Network error. Please check your connection." for a server-side outage. `guess`: `getGameSession` throws → 500 → dialog "could not be saved" (correct). `daily`: 500. `leaderboard`: 500 → modal shows outage, not an empty board (correct). | Misattribution at new-game 152-158. |
| Neon down | `new-game`/`daily` (uncached day): `pickRandomPano` rethrows non-dry errors → 500 generic. `guess` never touches Neon (region-locate is bundled) → **scoring stays up**. Cached daily needs no Neon (daily.js 37-40). | None structural. Good. |
| Mapillary down | Up to 3 draws × 10s timeout (mapillary 20-21) → 30s, then `success:false` with a **200** and "No street view images found in X... insufficient coverage" (new-game 83-86). Fluid compute gives Hobby 300s, so the function survives; the player waits 30s to be told the region has no coverage. Client `fetchNewRound` (GameClient 67) has no timeout; the 15s watchdog (303-307) covers only viewer `ready`. | Outage reads as coverage. `fetchRegionPanorama` already knows the difference (`dryMessage` vs `lastError`, 146 vs 173-176) and the route collapses it. |
| Reseed mid-day | Full seed: atomic rename (seed 205-213) + `countCache` overshoot refresh (pano-index 131-139). `--province`: DELETE→INSERT window reads as a dry pool → "no coverage". Daily pick is cached, so a rank shift after reseed cannot change today's panorama. | Document the `--province` window; otherwise fine. |
| Tree changes shape | Level names are literal in ~39 places across lib/components/api; `RoundResultDialog.js:43` infers "has a district" from `resolvedPath.length < 3`; `scripts/stats.mjs:701` hard-codes `LEVELS`. | Three fixed levels is a real invariant. Codify it (§5) rather than generalise. |

**The single seam**: error *kind*, not message text. Eight sites classify by string: `pano-index.js:106`, `mapillary.js:94,168`, `daily.js:42,66`, `new-game/route.js:152-158`. One small `src/lib/errors.js` with `DryPoolError`, `UpstreamError(service, status)`, and a `kindOf(error)` lets `fetchRegionPanorama` and the routes map kind → HTTP status and copy: dry pool → coverage message (still 200 `success:false` if you keep that contract), upstream → 503 "try again", auth → 500. This also fixes the Redis-outage misattribution and gives the client a `reason` on `/api/new-game` like `/api/guess` already has.

## 5. Conventions worth codifying (docs/development.md)

Followed, undocumented:
1. **Server-only modules** carry `SERVER-SIDE ONLY` in the header and are excluded from `regions.js`'s import graph (`tests/regions.test.js:242-255`). Rule: anything that can reach a panorama coordinate or id is server-only and must not be importable from a client component.
2. **Best-effort vs load-bearing writes** are made visible with `xOrNone`/`xOrIgnore` wrappers in the route, and the lib keeps throwing (new-game 20-24, guess 30-54). Rule: the route decides what may fail; a lib never swallows.
3. **One module per browser-storage concern** (`username.js`, `theme.js`, `last-region.js`, `daily-progress.js`, `audio.js`), read in an effect, never during render. `FirstRoundHint.js` is the one violation.
4. **Logical keys unprefixed; the adapter prefixes.** A new Redis primitive is one function in `upstash.js` plus support in `tests/fake-upstash-redis.js`, exercised in both lanes.
5. **Session claim before write** (`DEL` return value gates scoring). Any future write-after-claim must be idempotent or best-effort.
6. **Three fixed levels** `country > province > district`; codes uppercase in-app, lowercase in URLs (`regionSlug`/`regionFromSlug` own it).
7. **`||` not `??` on `URLSearchParams.get`** — the same comment appears at `region-request.js:28-31`, `leaderboard.js:83-84`, `region-coverage/route.js:21-23`. State it once in the doc, drop the repeats.
8. **Response contract**: `{ success, error, reason? }`; 400 = caller, 500 = server, 200 + `success:false` = "no coverage". Write it down, then decide whether outage becomes 503 (§4).

Violated, fix the doc: **individual parameters** apply to functions; React components take a props object (React idiom, universal in this codebase).

## 6. Prioritised refactor plan

| # | Item | Files | Risk | Tests | Independent | When |
|---|---|---|---|---|---|---|
| 1 | Slim `/api/guess` and `/api/leaderboard` envelopes; delete `fanOutScore` aliases, `submitScore`, `message`; drop `leaderboardMessage` from the dialog | `api/guess/route.js`, `api/leaderboard/route.js`, `lib/leaderboard.js`, `GameClient.js:273,357`, `RoundResultDialog.js:363-365`, `tests/leaderboard.test.js`, `tests/e2e/helpers.js`, `docs/features.md` | Low | `guess-route*.test.js`, rewritten `leaderboard.test.js`; maintainer runs e2e | Yes | **Before next feature** (the 5-round run will extend this envelope; extend a clean one) |
| 2 | Typed error seam; outage vs coverage on `/api/new-game`; one request-wide deadline (~8s) across Mapillary attempts; `fetchNewRound` client timeout | new `lib/errors.js`, `lib/mapillary.js`, `lib/pano-index.js`, `lib/daily.js`, `api/new-game/route.js`, `GameClient.js:57-73` | Low-medium | `mapillary.test.js`, `new-game-*.test.js`, `daily-route.test.js`, `guess-route-resilience.test.js` | Yes | **Before next feature** |
| 3 | Dead-surface sweep: `?city=`, `type`/`cityCode`, `POST /api/new-game`, `react-tabs` dep (highlight), docs drift lines in §3 | as listed | Very low | Existing route tests minus the removed cases | Yes | **Before next feature**, same session as 1 |
| 4 | `GameClient` staged extraction: `GameHeader`, then `use-round.js` (pure move), then daily init into the hook | `GameClient.js`, new `GameHeader.js`, new `use-round.js` | Medium (UI; e2e off-server) | e2e `game.spec.js`, `audio.spec.js`; no new unit tests until (b) exposes a pure function worth one | Yes | (a) any time; (b) **immediately before** the 5-round run, not after |
| 5 | Scripts: `scripts/lib/env.mjs`; `npm run data:refresh` | 4 scripts, `package.json` (highlight), `docs/development.md` | Trivial | `npm run data:seed -- --check` | Yes | Next time the pipeline is touched |
| 6 | `FirstRoundHint` storage into a lib module; codify §5 in `docs/development.md`; fix the component-props rule | `FirstRoundHint.js`, new `lib/first-round-hint.js` or fold into `last-region.js`, docs | Trivial | none needed | Yes | With item 3 |
| 7 | Document the `--province` reseed window and the three-level invariant | `docs/development.md`, `docs/project-overview.md` | None | none | Yes | With item 6 |
| — | **Never**: reducer rewrite of `GameClient`; one-store consolidation; `setupFiles` mock centralisation; removing `/game?region=`; renaming Redis keys; changing the two-`ThemeToggle` pattern | | | | | |

## Unresolved questions

1. Does anything outside this repo (a bookmarklet, a spreadsheet, a friend's script) call `/api/leaderboard` or `/api/guess` and read the legacy fields? If yes, item 1 needs a one-release deprecation; the evidence says no.
2. Should an upstream outage on `/api/new-game` become a 503 with `reason: 'upstream'`, or stay 200 `success:false` with different copy? The client handles both today; 503 is more honest and lets Vercel's logs separate outage from coverage.
3. Is the 5-round run still the next feature (per the 2026-09-20 counsel)? If so, item 4(b) is a prerequisite, not a nice-to-have; if not, 4(b) can wait indefinitely.
4. Real Mapillary `thumb_2048_url` lifetime (carried over from the dev review) decides whether the daily's per-request re-resolve is a cost worth caching for a few minutes.

Sources checked: Vercel Fluid compute Hobby duration (vercel.com/docs/functions/limitations); Neon Free scale-to-zero (neon.com/docs/introduction/scale-to-zero); Vitest `vi.mock` and setup files (vitest.dev/api/vi).
