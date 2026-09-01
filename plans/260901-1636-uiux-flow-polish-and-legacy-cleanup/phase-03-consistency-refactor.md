---
phase: 3
title: "Consistency refactor"
status: todo
priority: P2
effort: "4h"
dependencies: [1]
---

# Phase 3: Consistency refactor

## Overview

One color and icon language: semantic tokens replace raw Tailwind palette
classes and inline hex; Lucide replaces emoji; misleading class name renamed.
Audit items F15, F16b, F18.

## Requirements

- Functional: identical information hierarchy; only how colors/icons are
  expressed changes.
- Non-functional: every semantic color defined for light + dark in
  `globals.css`; no raw palette classes left at the touched call sites.

## Architecture

**Tokens (F15).** Add to `globals.css` alongside `--brand`: `--success`,
`--warning`, `--danger` (may alias `--destructive`), `--rank-gold` (+ dark
values). Map call sites:
- `RoundResultDialog.js` `getScoreBg` (green/emerald/amber/orange/red/neutral →
  success/warning/danger ramp on the new tokens) and `leaderboardMessage` green;
- `LeaderboardList.js` `DISTANCE_COLORS` and `getScoreColor` — simplify the
  6-step rainbow to two states: top-3 tint (`--rank-gold`) + default; amber
  "YOU" highlight → brand or rank token;
- `ResultMap.js` inline hex `#ef4444/#22c55e/#da251d` → values read from the
  token palette (Leaflet needs literal colors: define JS constants next to the
  markers that mirror the tokens, with a comment naming the token).

**Icons (F16b).** Replace emoji with Lucide (already the majority language):
ThemeToggle sun/moon/monitor, `page.js` 🍺 → matching Lucide glyph, check
`GameClient.js` and `DonateQRModal.js` for stragglers.

**F18.** Rename `.vn-gradient-bg` → `.vn-surface` in `globals.css:212-214` and
its usages (it is a flat surface, not a gradient).

## Related Code Files

- Modify: `src/app/globals.css`, `src/app/components/RoundResultDialog.js`,
  `src/app/components/LeaderboardList.js`, `src/app/components/ResultMap.js`,
  `src/app/components/ThemeToggle.js`, `src/app/page.js`,
  `src/app/components/GameClient.js`, `src/app/components/DonateQRModal.js`

## Implementation Steps

1. Define tokens (light + dark) in `globals.css`.
2. Migrate `RoundResultDialog`, `LeaderboardList`, `ResultMap` call sites;
   simplify `getScoreColor`.
3. Lucide icon sweep; verify no emoji remains in interactive chrome.
4. `.vn-gradient-bg` → `.vn-surface` rename (grep for all usages).
5. Visual pass in light + dark themes.

## Todo

- [x] Steps 1-5
- [x] `npm test`, `npm run lint`, `npm run build`, e2e green

## Success Criteria

- [x] `grep -rE "bg-(green|emerald|amber|orange|purple)-" src/app/components`
      returns nothing for the three migrated files
- [x] No emoji glyphs in buttons/toggles; Lucide throughout
- [x] Dark mode renders all new tokens correctly

## Risk Assessment

Cosmetic-only phase; the risk is silent contrast regressions in dark mode —
signal: manual theme pass; response: adjust dark token values, keep light ones.
F20 (Vietnamese font subset) stays deferred — note it in the phase close-out.
