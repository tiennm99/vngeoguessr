---
phase: 5
title: "UI region navigation"
status: todo
priority: P1
effort: "1.5-2d"
dependencies: [4]
---

# Phase 5: UI region navigation

## Overview

A flat list of five cards and five leaderboard tabs does not survive 67 nodes.
Both need to become navigable, and the leaderboard modal has to stop fetching
everything at once — at 67 nodes that is 134 requests on one click.

## Dependency change — apply manually

`src/components/ui/` holds nine primitives: `alert`, `badge`, `button`, `card`,
`dialog`, `input`, `label`, `skeleton`, `tabs`. There is no accordion and no
select, and `package.json` carries only `@radix-ui/react-dialog`, `react-label`,
`react-slot`, `react-tabs`.

**Add to `package.json`:**

```
@radix-ui/react-accordion
@radix-ui/react-select
```

Per `docs/development.md`, configuration changes are flagged for manual
processing — this phase cannot start until they are installed. The alternative
(hand-rolling an accessible accordion and a grouped listbox with roving focus and
`aria-expanded`) was rejected: the realistic outcome is `div`-based toggles with
broken keyboard support, verified only by eye.

Generate the shadcn wrappers into `src/components/ui/accordion.jsx` and
`select.jsx` so they match the existing vocabulary.

## Requirements

**Functional**
- Pick any node to play: Vietnam, a province, or a leaf.
- Leaderboards browsable at every level.
- A result shows all three credited levels.
- The game header shows what the player picked; the result reveals where the
  panorama actually was.
- Lam Dong and Long An show their partial-coverage label.
- Sub-threshold leaves are visible but not playable; `thin` leaves are labelled.

**Non-functional**
- The leaderboard modal fetches only the node being viewed — 2 requests, not 134.
- No horizontal scrolling on mobile. `TabsList` currently uses
  `repeat(cities.length + 1, ...)` (`page.js:246`), unusable at 67 columns.
- The region tree is imported, not fetched (Phase 4 removed `/api/regions`).

## Architecture

### Region picker (home page)

A two-level accordion, one row per province:

```
┌────────────────────────────────────────────┐
│  Play anywhere in Vietnam        424,691 › │   ← country CTA, always first
├────────────────────────────────────────────┤
│  Ha Noi                     30 districts ⌄ │
│  Ho Chi Minh                22 districts ⌄ │
│  Da Nang                     7 districts ⌄ │
│  Lam Dong          partial · 1 town      ⌄ │
│  Long An           partial · 1 town      ⌄ │
└────────────────────────────────────────────┘
        expanded ⌄
        ├─ Play anywhere in Ha Noi        ›
        ├─ Ba Dinh                  4,102 ›
        ├─ Hoan Kiem       thin     1,880 ›
        ├─ My Duc          no coverage      ← disabled
        └─ …
```

The province row plays the whole province; only the chevron expands. Counts and
playability come from `src/data/regions/counts.js` via `src/lib/regions.js` — a
static import, no network.

Links become `/game?region=<code>`; `?location=` keeps working.

**Vietnam scores zero.** The user accepted this: `calculateScore` returns 0 above
1 km and the covered provinces span ~1,100 km. It ships as an exploration mode.
Do not add a per-level band scale, and do not quietly demote the CTA — but the
label should set expectations rather than promise points.

### Leaderboard modal

Tabs stop being one-per-node. Two controls:

- A **level** row: `Vietnam` · `Province` · `District`
- A **region select** (Radix Select) listing nodes at that level, grouped by
  parent for districts

`score`/`distance` stays as the existing vertical toggle. Fetch on selection
change, keyed `${region}-${type}` into the existing `leaderboards` state. The
`fetchIdRef` guard (`page.js:32,50,75,83`) carries over unchanged — it is exactly
the guard a per-selection fetch needs.

`fetchAllLeaderboards` (`page.js:49,91`) is deleted. Eager fetching was only ever
viable at five cities.

Clear the cache when the modal **opens**, keeping it only for within-session tab
switching, so a player who just scored does not see a stale board.

### Game screen

`GameClient` reads `cityNames[location]` in five places (`:388, 412, 557, 576,
594`) plus `CITIES[location]?.bbox` (`:463`) and `cityCenters` (`:102`). Replace
with `regionPath(code)` from `src/lib/regions.js` — one helper, called from all
three render sites, not string-built at each.

- Header while guessing: what the player picked — `Ho Chi Minh`, or
  `Vietnam · anywhere`.
- Result modal: where it actually was — `Vietnam › Ho Chi Minh › District 7`.
  This is the interesting reveal for province and country games, and it is only
  safe **after** the guess (Phase 4 keeps it out of every pre-guess response).
- Rank rows: one per credited level from `levels`, replacing the hardcoded
  global/city pair (`:45-50, 189-192, 559, 566, 574-583`).

The map fits the picked region's bbox, so a district game opens zoomed to the
district — a real gameplay improvement that falls out of the tree.

### Debug coverage page

Its `cities` dropdown becomes the same level + region select pair, and its fetch
moves to `/api/debug/region-coverage?region=`.

**Caveat:** `src/app/debug/coverage/page.js` could not be read during planning or
by any red-team reviewer — a context hook denies paths matching `coverage`. Only
two touch points are grep-confirmed: the `cities` import (`:10`) and the fetch
URL (`:59`). Open the file first and adjust this section to what is actually there.

## Related Code Files

- Modify: `package.json` — two Radix packages (**manual**)
- Create: `src/components/ui/accordion.jsx`, `src/components/ui/select.jsx`
- Modify: `src/app/page.js` — region picker, lazy leaderboard modal
- Create: `src/app/components/RegionPicker.js`
- Create: `src/app/components/RegionSelect.js` — shared by the modal and debug page
- Modify: `src/app/components/GameClient.js` — region path, per-level ranks, bbox
- Modify: `src/app/debug/coverage/page.js` — region select, `?region=` fetch

## Implementation Steps

1. Confirm the two Radix packages are installed; generate the shadcn wrappers.
2. Read `src/app/debug/coverage/page.js` and reconcile this phase's description.
3. Build `RegionSelect` first — level row plus grouped select — since the modal
   and the debug page both consume it.
4. Build `RegionPicker`: province row plays, chevron expands, counts from the
   generated file, disabled state for sub-threshold leaves, `thin` label.
5. Replace the home page's card grid; delete `fetchAllLeaderboards`; add
   `fetchLeaderboard(region, type)` keyed into the existing cache; clear on open.
6. Rewrite the modal's `Tabs` block around `RegionSelect`.
7. Update `GameClient`: accept `?region=` with `?location=` fallback, render the
   path via `regionPath`, render `levels` as rank rows, use the picked bbox.
8. Update the debug coverage page.
9. Check every screen at 375 px. The old `TabsList` grid must be gone.
10. `npm run lint`, `npm test`, `npm run build:check`.

## Validation

- Vietnam, each province, and a sample of leaves are reachable in at most two
  clicks.
- Opening the leaderboard modal issues 2 requests, not 134.
- Switching region or type issues 2 more; revisiting a pair within the session
  issues none; reopening the modal refetches.
- The home page renders its picker on first paint with no network request for the
  tree.
- A game started at `VN` shows the full three-level path **in the result**, and
  nothing identifying the district before the guess.
- A game started at a leaf opens the map zoomed to that leaf.
- A sub-threshold leaf renders disabled and cannot be clicked through to `/game`.
- `thin` leaves carry a label.
- Lam Dong and Long An show their partial-coverage label.
- `/game?location=HN` and `/game?location=DL` both load.
- No horizontal scroll at 375 px on the home page, the modal, or the game screen.
- Keyboard: the accordion and select are operable without a mouse.

## Risk Assessment

**The accordion buries districts.** *Signal:* reaching a district takes more than
two clicks, or the province row's play action reads ambiguously against its
expand control. *Response:* split into an explicit `Play` pill plus a district
count button, matching the existing card's `Play →` affordance.

**Stale leaderboards after a guess.** *Signal:* a player returns to the home page
and sees their old total. *Response:* clear the cache on modal open — correctness
beats one saved request.

**The debug page description is wrong.** It was written from two grep hits
because no agent in this workflow could read the file. *Signal:* step 2 finds
something else. *Response:* adjust this phase, do not force the file to match it.

**Manual UI verification is the user's.** Per the repo's guidelines the agent runs
`npm test` and reports; the user drives the browser. *Response:* finish with an
explicit list of screens and breakpoints to check.

## Success Criteria

- [ ] The two Radix packages are installed and wrapped
- [ ] Every node is reachable and playable from the home page
- [ ] Leaderboards browse by level and region, fetching only what is shown
- [ ] The result screen shows all three credited levels
- [ ] The result reveals the actual district; nothing before the guess does
- [ ] Sub-threshold leaves are visible but disabled; `thin` leaves labelled
- [ ] Partial-coverage provinces are labelled
- [ ] `?location=` URLs still work, including `DL`
- [ ] No horizontal scroll at 375 px; accordion and select are keyboard-operable
- [ ] `npm run lint`, `npm test`, and `npm run build:check` pass
