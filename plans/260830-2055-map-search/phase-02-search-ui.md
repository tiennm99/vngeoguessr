---
phase: 2
title: "Search UI"
status: pending
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Search UI

## Overview

A search box overlaid on the guess map that combines instant region matches
with debounced Photon results, and pans/zooms the map on selection.

## Requirements

- Functional: text input with a results dropdown; region matches appear
  immediately, Photon results after a 350ms debounce (min 3 chars, limit 5,
  bbox = played region's bbox from `pickedRegion`, falling back to `VN`);
  selecting a result calls `map.fitBounds` when the result has a bbox, else
  `map.flyTo(center, 16)`; keyboard support (↑/↓, Enter, Esc closes and
  returns focus to the map); in-flight Photon requests aborted on new input.
- Non-functional: existing shadcn/Tailwind styling (`Input`-like field,
  `bg-card`, `border-border`); works over the Leaflet map (needs z-index above
  tiles, and `L.DomEvent`-safe container so typing/clicking doesn't fall
  through as a map click that drops a guess pin); mobile: visible only when
  the minimap is expanded; desktop: always visible.

## Architecture

- New `src/app/components/MapSearchBox.js` ("use client"). Props: `map`
  (Leaflet instance or null), `rootCode` (region code being played). Owns
  query state, debounce timer, `AbortController`, and merged results
  (regions first, then places; `places === null` → "Online search
  unavailable" row). Renders nothing until `map` is set.
- `GuessMapPanel.js` holds the map instance in a ref today
  (`handleMapReady`); mirror it into state (`const [map, setMap] = useState(null)`)
  so `MapSearchBox` re-renders when the map is ready. Render the box
  absolutely at the top of the panel: `top-2 left-2 right-14` while expanded
  on mobile (clear of the collapse button), `top-2 left-2 w-64` on desktop
  (`hidden lg:block` / conditional on `expanded` for mobile).
- Stop event fall-through with `stopPropagation` on pointer/click events in
  the container (the map click handler in `LeafletMap.js` must never fire from
  a search interaction).
- `GameClient.js` passes nothing new: `pickedRegion` already flows to
  `GuessMapPanel` (`bbox={pickedRegion?.bbox}`); add a `regionCode` prop
  (`pickedRegion?.code ?? 'VN'`) forwarded to `MapSearchBox`.
- A round reset (`expanded` collapse) clears the query and closes the dropdown.

## Related Code Files

- Create: `src/app/components/MapSearchBox.js`
- Modify: `src/app/components/GuessMapPanel.js` (map state, render search box)
- Modify: `src/app/components/GameClient.js` (forward `regionCode`)
- Modify: `docs/features.md`, `docs/game-flow.md` (mention map search in the
  guessing step)

## Implementation Steps

1. Build `MapSearchBox` against `searchRegions` / `searchPhoton` from phase 1:
   input, dropdown list, debounce, abort, keyboard nav, unavailable row.
2. Wire into `GuessMapPanel`: map instance state, placement classes for
   mobile-expanded and desktop layouts, collapse-clears-search.
3. Thread `regionCode` from `GameClient`.
4. Run `npm run lint` and `npm test` (guard tests cover the new import graph).
5. Hand off to the user for manual UI testing (phone minimap + desktop),
   per repo convention.

## Success Criteria

- [x] Search works on desktop and on the expanded mobile minimap; hidden when collapsed
- [x] Typing in the box never drops a guess pin; selecting a result never moves an existing pin
- [x] District queries respond instantly offline; street queries show region-bounded Photon results
- [x] Photon failure shows the unavailable row, region results still listed
- [x] `npm run lint` and `npm test` pass

## Risk Assessment

- **Event fall-through drops an accidental guess** — highest-blast-radius bug
  here. Mitigate with container-level `stopPropagation` plus manual check on
  touch; the collapsed-minimap tap-cover already isolates the collapsed state.
- **Photon rate limiting under real traffic** — public instance is fair-use;
  debounce + min-3-chars + limit 5 keeps volume low. If it becomes a problem,
  the observable signal is sustained `429`/`503` (the unavailable row showing
  often); pre-decided response: self-host Photon or swap `searchPhoton`'s
  endpoint — the UI contract doesn't change.
- **z-index conflicts with Leaflet panes** (map is `z-[500]`, overlay buttons
  `z-[1200]`) — place the search container at `z-[1200]` alongside the
  existing buttons; verify the dropdown isn't clipped by the panel's
  `overflow-hidden` (render the list inside the panel bounds, max-height +
  scroll).
