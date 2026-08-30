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
ten setter call sites surviving green). Lint currently emits 4 pre-existing
`no-unused-vars` warnings; treat any new one as a signal.

**Still open, verified 2026-08-30 on the Phase 6 docs review:**
- React prop/state contracts. `no-undef` does not see a prop a parent forgot to
  pass, a stale value left in state when a sibling is cleared, or a Leaflet
  layer never removed. Reason through the render and effect order by hand.
- Doc claims. Nothing asserts that `/docs/` matches the code. Two real misses in
  one pass: a doc naming `playableRegions()` as the enforcement point when the
  real one is `isPlayable()` via `resolvePlayableRegion()` (grep the named symbol
  for production callers, not just for existence), and a doc claiming a per-point
  `is_pano` field that is only a build-time filter (open the generated data and
  look at an actual record).

- `README.md` is outside the doc-update habit. Verified 2026-08-30: the six
  `/docs/` files were rewritten for the region tree while README still described
  "5 Vietnamese locations" incl. Da Lat/Duc Hoa as top-level, "In-memory
  sessions" (they are Redis), and Node 18+ against `engines: >=24`. Check README
  explicitly on any docs pass; it is never reached by editing `/docs/`.

**How to apply:** when a diff removes or renames state, props, helpers, or
imports, grep the whole file. For any React change, state plainly in the report
which criteria are runtime-only. For any doc change, verify each load-bearing
claim with a command and say which claims you could not verify. Related:
[[project-anti-cheat-invariant]] - same lesson, a passing test is not the property.
