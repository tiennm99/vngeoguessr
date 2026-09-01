---
phase: 4
title: "Legacy cleanup"
status: todo
priority: P2
effort: "2h"
dependencies: []
---

# Phase 4: Legacy cleanup

## Overview

Remove migration-era code identified by the 2026-09-01 legacy scout. Three
tiers: one-shot migration scripts (gated on the backfill actually running),
transitional session fallbacks (safe — 30-min TTL long expired), and permanent
compat that must NOT be touched.

## Requirements

- Functional: no behavior change for any live client or stored data.
- **GATE for step 2:** operator must first run
  `node --env-file=.env scripts/migrate-leaderboards.mjs --apply --confirm-prefix=vngeoguessr:`
  and see "applied. Backfill verified". Dry run on 2026-09-01 proved it has NOT
  run (Lam Dong/Long An missing 5/18/6/101 members from Da Lat/Duc Hoa). Keep
  the produced `leaderboard-backup-*.json` until the boards are confirmed good;
  do not commit it.

## Related Code Files

- Delete (step 2, gated): `scripts/migrate-leaderboards.mjs`,
  `scripts/lib/leaderboard-migration.mjs`, `tests/migrate-leaderboards.test.js`
- Modify: `package.json` (drop `leaderboard:migrate` script),
  `src/app/api/guess/route.js` (lines 68, 80-83),
  `src/app/api/new-game/route.js` (line 125),
  `tests/guess-route.test.js` (lines 106-116),
  `docs/project-structure.md` (drop migration script entries)
- **Keep forever (do not touch):** `:city:` Redis key prefixes (`upstash.js`),
  API legacy aliases `cityRank`/`cityDistanceRank`/`type`/`cityCode`
  (`guess/route.js:136-138`, `leaderboard/route.js:35-37`,
  `leaderboard.js:193-195, 341-342`), `?city=` query param
  (`region-request.js:31`) — they guard 30+ months of player score history.

## Implementation Steps

1. Remove session backward-compat: `session.pickedRegion ?? session.cityCode`
   and `session.regionCode ?? session.cityCode` fallbacks in `guess/route.js`
   and `new-game/route.js`; delete the compat test block in
   `guess-route.test.js:106-116`. (All sessions carry the new shape; TTL is
   30 min and the writing release shipped long ago.)
2. **[GATED — backfill applied + verified]** delete the two migration scripts,
   their test file, and the `leaderboard:migrate` npm script; update
   `docs/project-structure.md` (script list + test note). Git history keeps the
   restore path.
3. Grep sweep: `legacy|backfill|migration` under `src/` and `scripts/` — confirm
   remaining hits are only the permanent-compat comments listed above.

## Todo

- [x] Step 1 (ungated) — fallbacks removed 2026-09-01, compat test deleted
- [ ] Operator runs backfill; verify output (dry run 2026-09-01 confirmed NOT yet applied)
- [ ] Steps 2-3
- [x] `npm test`, `npm run lint`, `npm run build` green (after step 1)

## Success Criteria

- [ ] No `cityCode` session fallback in API routes; tests reflect current shape
- [ ] Migration scripts gone only after verified backfill
- [ ] Permanent compat untouched (assert `?city=` and legacy response fields
      still work via existing tests)

## Risk Assessment

- Deleting scripts before the backfill runs would strand Lam Dong/Long An
  boards permanently short — hence the hard gate. Signal: dry run not showing
  "both empty"/matching members; response: stop, run backfill first.
- Session-fallback removal breaks only a session created before the fan-out
  release — impossible now (30-min TTL). If a stale-session 500 ever appears in
  logs anyway, restore the null-coalesce (one line).
