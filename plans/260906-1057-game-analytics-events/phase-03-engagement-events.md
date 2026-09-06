---
phase: 3
title: "Engagement events"
status: pending
priority: P2
effort: "2h"
dependencies: [1]
---

# Phase 3: Engagement events

## Overview

Instrument the entry points around the game: which region rows get clicked, how
often the leaderboard is opened and filtered, whether the donate modal is
reached, and how players get their name. Answers "which parts of the surface
outside a round actually get used".

Shares `GameClient.js` with Phases 2 and 4 (donate press and the deep-link
username branch), so run it sequentially with them, not in parallel.

## Requirements

**Functional**
- `region_selected` fires on a play row click, tagged by which kind of row.
- `leaderboard_opened` fires on open, tagged by where from.
- `leaderboard_filtered` fires when the region level or board type changes.
- `donate_opened` fires from both the home and game entry points.
- `username_set` fires on save, distinguishing a typed name from a generated one.

**Non-functional**
- No emit in a render body; handlers only.
- `region_selected` must not break the modified-click passthrough in `PlayRow`
  (cmd/ctrl/shift/alt-click opens a new tab and returns early today).
- No username string ever reaches a payload — only `typed` vs `generated`.

## Architecture

| Event | File | Seam |
|---|---|---|
| `region_selected` | `RegionPicker.js` | `PlayRow`'s existing `onClick`, after the modified-click early return |
| `leaderboard_opened` | `LeaderboardModal.js` | The trigger's open handler (the component owns both button and dialog) |
| `leaderboard_filtered` | `LeaderboardModal.js` | The `level`/`region` setter and the `activeTypeTab` setter |
| `donate_opened` | `page.js`, `GameClient.js` | `setShowDonateModal(true)` / `setShowDonate(true)` |
| `username_set` | `page.js`, `GameClient.js` | `saveUsername` / `handleUsernameSkip`; and the deep-link generate branch in `submitGameResult` |

**`DonateQRModal.js` is not modified.** It is a presentational component
receiving `isOpen`; the meaningful signal is the press, which lives in the two
parents and carries the `from` distinction the modal itself cannot know.

**The `source` values for `region_selected`.** `PlayRow` is rendered from four
places in `RegionPicker`: the country row, the "Continue in ..." row, the
per-province row inside an accordion, and the district rows. Pass an explicit
`source` prop down rather than inferring it from the code — a province row and
a "Continue in {province}" row can carry the identical code, and inference
would merge two genuinely different gestures.

**`username_set` from the game page.** `GameClient.submitGameResult` generates
and persists a name for a deep-linked player who never saw the home prompt.
That is a real `username_set` with `mode: 'generated'`, `from: 'game'` — and it
is the one that reveals how many players arrive by direct link.

## Related Code Files

- Modify: `src/app/components/RegionPicker.js`
- Modify: `src/app/components/LeaderboardModal.js`
- Modify: `src/app/page.js`
- Modify: `src/app/components/GameClient.js` (donate + deep-link username only;
  the round lifecycle belongs to Phase 2)
- Read for reference: `src/lib/analytics.js` (Phase 1)

## Implementation Steps

1. **`RegionPicker.js`** — add a `source` prop to `PlayRow` and pass
   `'country'`, `'continue'`, `'province'`, `'district'` from the four call
   sites. In the existing `onClick`, emit `region_selected` after the modified-
   click early return and before the `onPlayClick` interception, so the event
   records the intent whether or not the name prompt cancels the navigation.

2. **`LeaderboardModal.js`** — emit `leaderboard_opened` with `from: 'home'` in
   the trigger handler. Emit `leaderboard_filtered` in the region/level change
   handler and the tab change handler, carrying the new value. Do not emit on
   the initial render or the first fetch — a filter event should mean the
   player changed something.

3. **`page.js`** — emit `donate_opened` with `from: 'home'` on the Buy me a beer
   press. In `saveUsername`, emit `username_set`; distinguish the paths:
   `handleUsernameSubmit` is `typed`, `handleUsernameSkip` is `generated`, both
   `from: 'home'`. Note `handleUsernameClose` routes a dismissal into
   `handleUsernameSkip`, so a dismissal correctly reports as `generated`.

4. **`GameClient.js`** — emit `donate_opened` with `from: 'game'`. In
   `submitGameResult`'s generate branch, emit `username_set` with
   `mode: 'generated'`, `from: 'game'`.

5. **Check whether the result dialog opens the leaderboard.** If
   `RoundResultDialog.js` has its own leaderboard entry point, instrument it
   with `from: 'result'`; if it only displays a message (as the `leaderboard
   Message` prop in `GameClient` suggests), drop the `'result'` value from the
   vocabulary and say so — an enum value that never fires is worse than absent.

6. Verify in dev: click each of the four row kinds, open the leaderboard, change
   both filters, open donate from both pages, and set a name both ways.

7. Run `npm test`, `npm run lint`, `npm run test:e2e`.

## Todo

- [ ] `PlayRow` `source` prop, four call sites, `region_selected` emitted
- [ ] Modified-click passthrough still works (cmd-click opens a new tab)
- [ ] `leaderboard_opened` + `leaderboard_filtered`, no emit on initial render
- [ ] `donate_opened` from home and game
- [ ] `username_set` for typed, skipped, dismissed and deep-link-generated paths
- [ ] Step 5 resolved: `from: 'result'` either wired or removed from the vocabulary
- [ ] `npm test`, `npm run lint`, `npm run test:e2e` green

## Success Criteria

- [ ] All four `region_selected` sources are distinguishable in the payload
- [ ] Cmd/ctrl-clicking a play row still opens a new tab and emits nothing
- [ ] Opening the leaderboard emits exactly one `leaderboard_opened` and zero
      `leaderboard_filtered`
- [ ] No username string appears in any payload — only `typed` / `generated`
- [ ] Every enum value in the phase's events can actually be produced by a real
      gesture (no dead values left in the vocabulary)
- [ ] 9/9 e2e specs still pass

## Risk Assessment

**`region_selected` fires but the navigation is cancelled.** When no name is
stored, `onPlayClick` returns true and the click opens the name prompt instead
of navigating. The event still fires — deliberately, since it records the
region the player wanted. Consequence to accept: `region_selected` will slightly
exceed `round_started` for first-time visitors. Document it rather than
suppressing it; the gap is itself the first-visit funnel drop.

**Emitting on the accordion trigger by mistake.** Expanding a province to see
its districts is not selecting a region. Signal: `region_selected` counts far
exceed play counts. Response: only `PlayRow` emits; `AccordionTrigger` stays
untouched.

**Assumption that may break:** that `LeaderboardModal` owns its own trigger
button. Verified at `src/app/components/LeaderboardModal.js:11-16` (the comment
states it owns both). If a future refactor splits them, the `from` property
loses its meaning and must move to the caller.
