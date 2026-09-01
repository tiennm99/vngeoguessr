---
phase: 1
title: "Quick wins"
status: todo
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Quick wins

## Overview

The 12 small presentation fixes from the audit — labels, tooltips, dialog a11y,
touch targets, page parity. No flow or structure changes.

## Requirements

- Functional: every item below lands exactly as scoped; no feature removed.
- Non-functional: no API/localStorage/visual-token contract change.

## Related Code Files

Modify only: `src/app/page.js`, `src/app/components/UsernameModal.js`,
`src/app/components/GameClient.js`, `src/app/components/RoundResultDialog.js`,
`src/app/components/ResultMap.js`, `src/app/components/RegionPicker.js`,
`src/app/components/DonateQRModal.js`, `src/app/components/LeaderboardModal.js`,
`src/app/components/ThemeToggle.js`, `src/app/credits/page.js`

## Implementation Steps

1. **F1** — make "Playing as X" a button that reopens `UsernameModal`; show on
   mobile (chip). No stored name → "Set name" chip. `UsernameModal` accepts an
   initial value prop so reopening pre-fills the current name.
2. **F2a** — relabel modal CTAs: "Start Playing" → "Save name"; "Skip" →
   "Skip — random name" (wording pairs with Phase 2's random-name behavior; in
   this phase Skip still just closes).
3. **F5** — Skip button: `title`/`aria-label` "Skip this location — no penalty"
   (`GameClient.js:487-494`).
4. **F6** — result dialog: caption "It was in" + region path in
   `font-semibold text-foreground`; caption the bands strip "This round's
   scoring ladder"; reorder body score → distance → map → path → ladder →
   leaderboard cards (`RoundResultDialog.js:85-212`).
5. **F7a** — captions above the two result grids: "Leaderboard points added" /
   "Best-distance ranks"; `title` on `(+N)`: "each board grades your distance on
   its own scale".
6. **F8** — result map: guess dot red → blue (match in-game pin), keep actual
   green; legend row "● Your guess ● Actual location" in `RoundResultDialog.js`
   (`ResultMap.js:42-70`).
7. **F9/F10** — align score label and message cutoffs (derive both from one
   band); fix amber/orange circle contrast (darken bg or dark text).
8. **F11/F12** — pano count gets a unit ("spots" or "locations") and `title`;
   badge tooltips: partial = "Street imagery covers only part of this province",
   few streets = "Limited street imagery — repeats likely" (`RegionPicker.js`).
9. **F14** — every dialog: centered `text-2xl` title + `DialogDescription`
   (sr-only where visually redundant). Add missing descriptions to Donate and
   Leaderboard (Radix warning). Drop Donate's redundant footer Close.
10. **F16** — ThemeToggle buttons `w-9` → `w-11` (44px floor).
11. **F19** — credits page: add ThemeToggle to header; "Back to game" → "← Home".

## Todo

- [x] Steps 1-11
- [x] Update `tests/e2e/` selectors/labels touched by renames (username modal spec)
- [x] `npm test`, `npm run lint`, `npm run build`, e2e green

## Success Criteria

- [x] All 12 audit QW items verified in UI
- [x] No Radix DialogDescription warnings in console
- [x] e2e smoke green

## Risk Assessment

Low. Renamed button labels can break e2e text selectors — signal: spec failure;
response: update the spec text, not the label.
