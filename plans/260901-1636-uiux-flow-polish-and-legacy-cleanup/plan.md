---
title: "UI/UX flow polish and legacy cleanup"
description: "Newbie-friendly flow, consistent presentation, migration-era code removal"
status: in-progress
priority: P1
effort: "2-3d"
tags: [ui-ux, cleanup]
created: 2026-09-01
---

# UI/UX flow polish and legacy cleanup

## Overview

Deliver the accepted brainstorm (2026-09-01): make the whole play flow clearer and
newbie-friendly, unify presentation, and remove migration-era legacy code. Source
audit: `plans/reports/ui-ux-review-260901-1624-presentation-audit.md` (findings
F1-F20 referenced by phases).

**Contract**
- Outcome: consistent UI, clear presentation, easy first-time play; legacy code gone.
- Constraints: keep all features; no breaking changes (API responses, Redis keys,
  localStorage compat); legacy mixed board scores stay; JS only; individual function
  params; only `src/`, `docs/`, `plans/` modified.
- Non-goals: new gameplay features, score re-grading, session summary screen,
  TypeScript, font change (F20 deferred), mobile expanded-map peek.
- User decisions: pano counts get labels (keep visible); username prompt deferred to
  first Play click; blank/skipped username → generated random name; per-round
  results only.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | First-time player understands every step without outside help | P1 |
| 2 | One dialog/color/icon language across all screens | P2 |
| 3 | Migration-era code removed without touching player data | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Quick wins](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Flow redesign](./phase-02-flow-redesign.md) | Pending |
| 3 | [Phase 3: Consistency refactor](./phase-03-consistency-refactor.md) | Pending |
| 4 | [Phase 4: Legacy cleanup](./phase-04-legacy-cleanup.md) | Pending |

Phases are independently shippable, in order. Phase 4 step 1 is gated on the
operator running the leaderboard backfill (verified NOT yet applied in prod on
2026-09-01; dry run showed Lam Dong/Long An boards missing 5/18/6/101 source
members).

## Success Criteria

- [ ] `npm test`, `npm run lint`, `npm run build` green after each phase
- [ ] Playwright e2e smoke (`tests/e2e/`) green, updated where flow changed
- [ ] All F-findings mapped to a phase are addressed or explicitly deferred
- [ ] No change to `/api/*` response shapes, Redis key names, or existing
      localStorage values

<!-- slug: uiux-flow-polish-and-legacy-cleanup -->
