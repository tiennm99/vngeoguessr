---
name: project-quality-gates-blind-spots
description: What this repo's four gates (lint, vitest, integration, build:check) can and cannot catch - no-undef now closed, but UI behaviour and doc truthfulness remain unverifiable by any gate
metadata:
  type: project
---

`npm run lint`, `npm test`, `npm run test:integration` and `npm run build:check`
can all be green while a screen is broken and a doc is false.

**Why:** JavaScript-only by policy, so no type checker. `tests/` has no component
tests and no `@testing-library` dependency - every suite is lib/API level.

**Closed since 2026-08-30:** `eslint.config.mjs` now adds `no-undef: error` and
`no-unused-vars: warn` on top of `next/core-web-vitals`, with browser+node
globals. That kills the original failure (six `useState` declarations deleted,
ten setter call sites surviving green). Verified 2026-08-31: lint is 0 errors /
16 warnings, all `react-hooks/set-state-in-effect` or `react-hooks/refs` and all
matching an established local pattern (localStorage read in an effect, callbacks
mirrored into refs). Re-count with `npx eslint . -f json` rather than trusting a
remembered number; treat a warning of a NEW rule id as the signal.

**Partly closed 2026-08-31:** a Playwright lane exists (`npm run test:e2e`), but
every API is stubbed in `tests/e2e/helpers.js`, whose own header says the stubs
mirror the real route shapes and must be updated with any contract change. That
is a manual promise no gate enforces: the `gameResult.bands` field was added to
`/api/guess` and the stub was not updated, so the UI block gated on it rendered
in zero tests. The stub also serves the SAME panorama URL every round, so
`PanoramaViewer`'s `key={imageData.url}` never changes and "next round loaded"
assertions pass without a viewer remount. On any diff touching an API response
shape or the round transition, open `helpers.js` and check it moved too.

Second instance 2026-09-01 (Geoapify tile migration): the stubs match third-party
hosts *literally* (`**/tile.openstreetmap.org/**`), so swapping a provider behind
an env var silently un-stubs the suite - `npm run dev` loads `.env`, so the moment
a real key exists the "offline" run hits the vendor and spends metered credits.
Any diff that makes an outbound host configurable must widen the matcher too.

Third stub-drift instance, found 2026-09-21: `guessResponse()` in `helpers.js` omits
`hit`, which `GameClient.js` and `RoundResultDialog` both consume, so the region-hit
line renders in zero e2e runs; and there is no `**/api/daily**` stub at all while
`/daily` exists and `GameClient` fetches it. A cheap durable gate: a vitest test
asserting the stub's key set is a superset of the real route response's.

**Still open, verified 2026-08-30 on the Phase 6 docs review:**
- React prop/state contracts. Live instance found 2026-09-21: `/api/guess` returns
  `gameResult.partial`, `RoundResultDialog` renders on `result.partial`, and
  `GameClient.js` never copies it into the `outcome` object between them — so a
  partly-written round silently shows the success message. Lint, 357 tests and the
  build are all green over it. When a route adds a response field, grep the field
  name through the component chain, not just the route test. `no-undef` does not see a prop a parent forgot to
  pass, a stale value left in state when a sibling is cleared, or a Leaflet
  layer never removed. Reason through the render and effect order by hand.
- Doc claims. Nothing asserts that `/docs/` matches the code. Two real misses in
  one pass: a doc naming `playableRegions()` as the enforcement point when the
  real one is `isPlayable()` via `resolvePlayableRegion()` (grep the named symbol
  for production callers, not just for existence), and a doc claiming a per-point
  `is_pano` field that is only a build-time filter (open the generated data and
  look at an actual record). `docs/project-structure.md` is the worst offender by
  construction: it enumerates EVERY `src/lib/*.js` and every page one by one, so
  any new module or route silently falsifies it (missed for `src/lib/map-tiles.js`
  and `src/app/credits/page.js`, 2026-09-01). Diff the new-file list against it.
  Two more self-falsifying enumerations found 2026-09-01 (UI/UX polish pass):
  `docs/development.md` "Styling Conventions" names CSS classes and per-file
  raw-palette exceptions literally (`vn-gradient-bg`, "score bands and podium
  colors in RoundResultDialog.js/LeaderboardList.js, always with a `dark:`
  variant"), so any class rename or token migration turns it into instructions
  for the pattern just removed; and `docs/game-flow.md` step 1 scripts the player
  flow beat by beat, so moving *when* a modal fires falsifies it. On any CSS
  class rename, grep `docs/` for the old name; on any flow-timing change, reread
  `game-flow.md`.

- `README.md` is outside the doc-update habit. Verified 2026-08-30: the six
  `/docs/` files were rewritten for the region tree while README still described
  "5 Vietnamese locations" incl. Da Lat/Duc Hoa as top-level, "In-memory
  sessions" (they are Redis), and Node 18+ against `engines: >=24`. Check README
  explicitly on any docs pass; it is never reached by editing `/docs/`.

**Opened 2026-08-31 by the Neon migration:** production SQL now runs against a
driver no gate exercises. `npm test` and `npm run test:integration` both mock
`@neondatabase/serverless` and run PGlite instead, so parameter serialisation,
type inference (`= ANY($n)` on an untyped param, `count(*)` needing `::int`) and
query plans are only ever proven by a manual smoke test against real Neon. There
is also no perf gate: an unindexed `ORDER BY ... OFFSET` or a window-function
sort over 226k rows passes every check. Ask for the index list whenever a diff
adds a query.

**Duplicate-mount state, found 2026-09-21:** the game header mounts breakpoint
pairs of the same control (`GameClient.js:550-571` renders ThemeToggle and
SoundToggle twice, one wrapper `display:none`). SoundToggle survives that because
`audio.js` exports `watch*` subscriptions; ThemeToggle does not, so its two copies
disagree after a click. `audio.js`'s getter+setter+`watch*` trio is the local
pattern for browser-preference state - a module lacking `watch*` (`theme.js`,
`username.js`, `last-region.js`, `daily-progress.js` as of this date) cannot be
read correctly by more than one mounted component. Check for a second mount before
accepting a mount-time `useState` seed.

**React version note, 2026-09-21:** React is 19.2.8, where `useEffectEvent` and
`useSyncExternalStore` are both stable (`typeof React.useEffectEvent === 'function'`
- verify, do not assume). `eslint.config.mjs:36-41` justifies all 21 hook warnings
as deliberate, but that comment predates 19.2: the callback-props-into-refs sites
are now a plain `useEffectEvent` fix, not a false positive. Only a ref holding
DATA (not a callback) is genuinely unfixable that way.

**How to apply:** when a diff removes or renames state, props, helpers, or
imports, grep the whole file. For any React change, state plainly in the report
which criteria are runtime-only. For any doc change, verify each load-bearing
claim with a command and say which claims you could not verify. Related:
[[project-anti-cheat-invariant]] - same lesson, a passing test is not the property.
