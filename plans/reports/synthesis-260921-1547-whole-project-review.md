# Whole-project review: refactor plan (2026-09-21)

Three independent read-only reviews of `dev` at 77654d2, with a mandate to
recommend refactors or rewrites. No code changed.

- [Architecture](advisory-260921-1529-architecture-review.md)
- [Front-end structure](code-review-260921-1529-frontend-structure.md)
- [Backend, pipeline, tooling](code-review-260921-1529-backend-tooling.md)

Gates re-run by all three: 357 tests pass, lint 0 errors / 21 warnings,
production compile green.

## Verdict: no rewrite. Extract, delete, and fix.

All three agree independently. The load-bearing seams are in place and
test-enforced: server-only pano index (import-graph test), atomic DEL
session claim, adapter-owned key prefix, best-effort vs load-bearing write
wrappers. What accumulated is surface: a legacy API envelope, alias fields
with no readers, copied helpers, and one component that grew to 713 lines.

## Bugs found (fix first, small)

Verified against source by the controller where marked.

1. **`partial` never reaches the dialog** (verified). `/api/guess` returns
   `gameResult.partial`, `RoundResultDialog` renders on `result.partial`, and
   `GameClient` never copies it into the outcome object. A half-credited round
   shows the success message. One line.
2. **`/api/new-game` returns HTTP 200 on failure** (verified). The "no
   coverage" path carries no status. Invisible only because the client checks
   `data.success`. Also: a Mapillary outage is reported as missing coverage,
   although `fetchRegionPanorama` already distinguishes a dry pool from an
   upstream error.
3. **Two ThemeToggle mounts disagree after a click.** Each seeds local state
   once and has no subscription; rotate a phone across `sm` and the visible
   group shows the old theme, so the first press goes the wrong way.
   SoundToggle already solves this with a `watch*` subscription; `theme.js`
   lacks the export.
4. **`username.js` and `FirstRoundHint.js` call `localStorage` bare.** Every
   other storage module guards. A blocked-storage browser throws inside the
   home page's landing effect.
5. **`mapCenter` is state plus effect for a value that never changes**, so
   the map renders one frame at Ho Chi Minh coordinates on every region.
6. **e2e stub drift**: `guessResponse()` omits `hit`, so the region-hit line
   renders in zero e2e runs; there is no `/api/daily` stub. Proposed gate: a
   vitest test that the stub's key set is a superset of the real route's.
7. **`build-pano-index.mjs`'s `.env` copy lacks the unquoting** the other
   three have; a quoted token breaks it today.
8. **`new-game/route.js` calls `error.message.includes()` unguarded**, so a
   thrown non-Error makes the error handler itself throw. It also logs the
   answer's district against the session id, the only place the pre-guess
   secret is written outside Redis.

## Dead surface (delete in one commit, no client migration)

Grep-verified by the backend reviewer: `city`/`cityDistance`/`districtDistance`
aliases have zero readers; `global`/`province`/`globalDistance`/
`provinceDistance` exist only to build the four legacy `*Rank` fields no client
reads; top-level `leaderboard`, `distance` and `message` in `/api/guess`
duplicate `gameResult`; `/api/leaderboard`'s `count`/`region`/`type`/`cityCode`/
`leaderboardType` are unread; `POST /api/new-game` debug lookup has no caller;
`submitScore` has no production caller yet is the primary write path in
`leaderboard.test.js`; `zScore`, `indexedProvinces`, `isDay`, `countPanos`'s
country branch, `MAX_PER_CITY` cap branch; `@radix-ui/react-tabs` dependency
with no `ui/tabs.jsx`. Keep: `/game?region=` redirect (user-facing URL) and
`?city=` (links in the wild).

## Prioritized refactors

| # | Item | Effort | Ships alone | Before next feature |
|---|---|---|---|---|
| 1 | Bugs 1–8 above | S | yes | yes |
| 2 | Slim the `/api/guess` envelope to `gameResult`; delete aliases, `submitScore`, legacy ranks; retarget `leaderboard.test.js` at `submitRoundScore`; update e2e stubs | S–M | yes | yes |
| 3 | Typed error seam: `src/lib/errors.js` with `DryPoolError`/`UpstreamError` replacing eight `message.includes(...)` sites; upstream outage becomes a real status (502/503) instead of 200 "no coverage"; one request-wide Mapillary deadline; client fetch timeout | M | yes | yes |
| 4 | Storage modules get `get`/`set`/`watch` and one ~10-line `useStoredValue` over `useSyncExternalStore`; fixes bug 3, collapses the username triplication, and clears most of the 21 lint warnings (20 are real fixes now that `useEffectEvent` is stable in React 19.2; one is a justified suppression). Cache `JSON.parse` in `daily-progress.js` first or the snapshot loops | M | yes | yes |
| 5 | GameClient extraction, staged: `GameHeader` (any time) → `use-round.js` as a pure move → daily replay into the hook. The architecture reviewer says stop there; the front-end reviewer wants the epoch refs in reducer state so the staleness rule gets a unit test. Do the header now, the hook only as a prerequisite for the 5-round run | M–L | in stages | header yes, hook no |
| 6 | Scripts: `scripts/lib/env.mjs` (four copies), move the inline `REGIONS` config to `scripts/lib/region-config.mjs` (it collides in name with the generated tree), one `drawFromProvinces` primitive shared by `pickRandomPano` and `pickPanoBySeed`, `data:refresh` command stating the Mapillary cost | M | yes | next pipeline touch |
| 7 | Tests for `scripts/lib/assign-districts.mjs` (221 lines, decides which board a guess scores on, zero tests) | M | yes | yes |
| 8 | Styling homes: `cardRowVariants`, a touch-size button variant instead of three `min-h-11` patches, `@utility safe-x`, a reveal-sequence class for six inline delays; `<PlaceName lang="vi">` through the eight name render sites; `role="dialog"` and focus trap on the expanded guess map; `debug/page.js` drop `"use client"`; `MapSearchBox` dynamic (53 KB region tree off `/game/*`) | S each | yes | no |
| 9 | Codify conventions in `docs/development.md`: server-only header + import-graph rule; route decides best-effort vs load-bearing, lib never swallows; one module per storage concern; new Redis primitive = adapter function + fake support; claim-before-write; `\|\|` not `??` on `URLSearchParams.get` (stated once); response contract `{success, error, reason?}`. Amend the "individual parameters" rule: every React component destructures props, and should | S | yes | yes |

## Never (all three agree)

GameClient reducer rewrite (the epoch/ref juggling guards real async races a
reducer does not remove; the front-end reviewer's reducer sketch is the
dissent, filed under item 5); one-store consolidation (provider change, and
Neon Free scales to zero); `setupFiles` for the vi.mock boilerplate (Vitest
caches modules imported in setup before mocking); promoting the fake Redis to
a package; renaming Redis keys; removing `/game?region=`.

## Decisions for the maintainer

1. Upstream outage: keep 200 with `success:false`, or move to 503? The
   reviewers recommend a real status; the client already handles both.
2. `eslint.config.mjs` documents all 21 warnings as deliberate. Two
   reviewers say 20 are real fixes now. Fix them, or update the comment?
3. Is `submitScore` backing any real backfill procedure? Deletion assumes no.
4. Is the 5-round run still the next feature? Decides whether the `use-round`
   extraction is worth doing now.
5. Is the username interception on the home page dead code? Every modal exit
   persists a name. If so, `onPlayClick` threads through seven call sites for
   nothing, and removing it lets `RegionPicker` become a server component.

## Doc drift

`project-structure.md` omits `geo-search.js` and three `scripts/lib`
modules; `development.md` says tests run "well under a second" (24.5s
measured); `game-flow.md` describes leaderboard pagination that does not
exist; `tech-stack.md` two stale lines. All listed with line numbers in the
architecture report.
