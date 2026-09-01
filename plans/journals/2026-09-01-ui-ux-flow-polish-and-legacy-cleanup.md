---
title: UI/UX flow polish and legacy cleanup
date: 2026-09-01
summary: "Newbie-friendly flow rework, semantic tokens, session cityCode fallback removal; migration-script deletion gated on unapplied prod backfill"
---

# UI/UX flow polish and legacy cleanup

## What happened

Delivered the accepted brainstorm (UI/UX presentation audit + legacy scout, both
agent-reviewed) as plan `plans/260901-1636-uiux-flow-polish-and-legacy-cleanup`.
Six commits on main (0876a9d..0ce5673), not pushed.

- **Phase 1 (quick wins):** editable "Playing as X" header chip (mobile too),
  honest modal CTAs, skip tooltip, result dialog reorder (map above fold,
  labeled "It was in" reveal, captioned grids), blue guess dot + legend,
  labeled pano counts ("spots") and badge tooltips, DialogDescription added to
  Donate/Leaderboard, ThemeToggle 44px, credits page parity.
- **Phase 2 (flow):** username prompt deferred to first Play click
  (RegionPicker interception, navigation resumes after save/skip); skip and
  deep-link first-submit generate a persisted `Player-xxxxxx` name (6 base36
  chars — 4 had birthday-collision odds since the name is the ZSET member);
  one-time FirstRoundHint banner (`vngeoguessr_hint_seen`); desktop "Click to
  place your guess" ghost label; session rounds/points badge in game header;
  leaderboard bookkeeping collapsed into a `<details>` section.
- **Phase 3 (consistency):** semantic tokens `--success/--warning/--danger/
  --rank-*` (light+dark) in globals.css replace raw Tailwind palettes in
  RoundResultDialog/LeaderboardList; ResultMap exports MARKER_COLORS shared
  with the dialog legend; emoji → Lucide (ThemeToggle Sun/Moon/Monitor, Beer);
  `.vn-gradient-bg` → `.vn-surface`.
- **Phase 4 (partial):** session `cityCode` fallbacks removed from guess/
  new-game routes + compat test deleted (provably unreachable: new-game rejects
  rounds without regionCode before the session write, 30-min TTL).

Code review (DONE_WITH_CONCERNS) caught H1: the hint banner painted over the
expanded mobile map's search/collapse controls — the panel's z-[1200] children
are clamped inside its z-[500] stacking context. Fixed by hiding the banner
while the minimap is expanded. Also fixed: header overflow on small phones
(chip truncates, row wraps), modified-click hijack on Play rows, summary focus
ring, stale docs (development.md styling conventions, game-flow.md username
step, project-structure.md).

Verified: 252 unit tests, 12 Playwright e2e, lint 0 errors (19 warnings, +1 vs
baseline in the codebase's accepted localStorage-read-in-effect idiom), build
clean.

## Decision

- Random-name fallback replaces the shared "Anonymous" leaderboard bucket going
  forward; existing "Anonymous" board rows stay (data, not code).
- Score-total rainbow in LeaderboardList dropped to neutral — a running total
  has no ladder to grade against. Distance tints kept, 3 semantic states.
- Permanent compat kept forever: `:city:` Redis key prefixes, API aliases
  (`cityRank` etc.), `?city=`/`?location=` params — they guard player history.

## Next steps

- **Gate open:** run
  `node --env-file=.env scripts/migrate-leaderboards.mjs --apply --confirm-prefix=vngeoguessr:`
  (dry run 2026-09-01 proved the Da Lat→Lam Dong / Duc Hoa→Long An backfill has
  NOT been applied; destinations hold 0-2 members vs 5/18/6/101 sources). A
  permission classifier blocked the agent from running it; operator must.
- After verified apply: delete the two migration scripts, their test, the
  `leaderboard:migrate` npm script; update docs (phase 4 steps 2-3).
- Manual UI pass in light + dark themes (user-owned per project convention).
- Deferred: Vietnamese font subset (F20), mobile expanded-map panorama peek.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
