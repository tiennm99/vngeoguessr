---
phase: 2
title: "Flow redesign"
status: todo
priority: P1
effort: "6h"
dependencies: [1]
---

# Phase 2: Flow redesign

## Overview

Reshape when things appear, keeping every feature: username prompt moves to the
first Play click with a random-name fallback, one-time in-game hint overlay,
session progress badge, collapsible leaderboard section in the result dialog.

## Requirements

- Functional: F2b, F3, F4, F7b from the audit + the random-username decision.
- Non-functional: purely client-side; `/api/guess` still receives a non-empty
  `username`; existing stored usernames untouched.

## Architecture

**Random username.** New `generateRandomUsername()` in `src/lib/username.js`:
`Player-` + 4 random base36 chars (fits the modal's `[a-zA-Z0-9_-]`, 2-20 rule).
Generated once, persisted via `setUsername`, thereafter behaves like any chosen
name (editable via the "Playing as X" chip from Phase 1).

**Username at the moment it matters.**
- `page.js`: remove the on-mount auto-open (`:42-49` keeps reading the stored
  name for the chip). Intercept the first Play navigation in `RegionPicker`
  rows: if no stored username, open the modal; navigate after save/skip.
- Modal Skip: generate + persist a random name, then continue navigation.
- `GameClient.js:173`: deep-linked `/game` with no stored name — replace
  `username || 'Anonymous'` with generate-and-persist on first submit, so the
  leaderboard shows the player's editable random name. Existing "Anonymous"
  rows in board data remain (data, not code).

**Hint overlay (F3).** Small `first-round-hint.js` client component (or ~30
lines in `GameClient`): one-time dismissible overlay on the game screen,
localStorage key `vngeoguessr_hint_seen` — "Drag to look around · Click the map
to drop your guess · Submit". Auto-dismiss on first map click. Desktop guess map
gets a transient "Click to place your guess" ghost label until `hasGuess`
(mirror of the mobile cover, `GuessMapPanel.js:76-86`).

**Session progress (F4).** Client-side counter in `GameClient` state (rounds
played, points sum from each submitted result) rendered as a small header badge
next to the region name (`GameClient.js:393-398`). Resets on page load — no API
or storage change.

**Result dialog (F7b).** Wrap bands strip + both leaderboard grids in one
collapsible "Leaderboard results" section (accordion or `<details>` styled to
match), so score → distance → map → path fits one phone viewport.

## Related Code Files

- Create: `src/app/components/first-round-hint.js` (optional; may inline)
- Modify: `src/lib/username.js`, `src/app/page.js`,
  `src/app/components/RegionPicker.js`, `src/app/components/UsernameModal.js`,
  `src/app/components/GameClient.js`, `src/app/components/GuessMapPanel.js`,
  `src/app/components/RoundResultDialog.js`

## Implementation Steps

1. `generateRandomUsername()` + unit test in `tests/` (validates modal charset
   and length rules).
2. Defer modal to first Play click; wire save/skip → persist → navigate.
3. Random-name fallback in modal Skip and in `GameClient` first submit.
4. Hint overlay + desktop ghost label, both gated and dismissible.
5. Session progress badge.
6. Collapsible leaderboard section in result dialog.
7. Update `tests/e2e/` username-modal and full-round specs for the new timing
   (modal appears on Play, not on landing).

## Todo

- [x] Steps 1-7
- [x] `npm test`, `npm run lint`, `npm run build`, e2e green

## Success Criteria

- [x] Fresh profile: landing shows game intro with no modal; Play opens modal;
      Skip yields "Playing as Player-xxxx" and starts the game
- [x] Deep link `/game?region=…` on fresh profile: hint overlay shows once;
      first submit writes a generated name to the board
- [x] Header badge increments per round; per-round results otherwise unchanged

## Risk Assessment

- Modal timing change breaks the e2e username spec by design — update the spec
  as part of step 7, not after.
- Race: two RegionPicker rows both intercepting navigation — intercept in one
  shared handler. Signal: double modal or lost navigation in manual test;
  response: centralize in `page.js` state.
- `RoundResultDialog.js:202` shows `username || 'Anonymous'` — after step 3 a
  name always exists; leave the fallback expression as dead-safe or remove with
  the phase, either is fine.
