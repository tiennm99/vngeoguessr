# Layout refactor — verification review

Date: 2026-09-02 · Scope: uncommitted changes on `main` (game screen + debug/coverage + z-ladder)
Method: static read of the full diff, then live measurement against `npm start` (Next 16.3.3, port 3000) with Playwright at 6 viewports, plus interaction tests. Screenshots and raw measurements in the session scratchpad.

Verdict: **layout holds. No breakage found.** Every item the prior audit (`ui-ux-review-260902-0210-game-screen-overlaps.md`) raised as CRITICAL/HIGH is fixed and measured fixed. Eight defects were found and fixed during this review, including the two items first recorded as product calls.

---

## Gates

| Gate | Result |
|---|---|
| `npm run build` | pass — 16/16 static pages |
| `npm run lint` | 0 errors, 19 warnings (all pre-existing, `react-hooks/set-state-in-effect` in `src/lib/`) |
| `npm test` | 233/233 pass, 16 files |
| Horizontal overflow | 0px at 360/375/640/667/768/1280 on `/`, `/game`, `/debug/coverage` |
| Unintended page scroll | `/game` scrolls 0px at every viewport; `/debug/coverage` scrolls only in landscape phone, by design (see item 5) |

## Measured fixes (live, not inferred)

Viewports: 375×667, 360×640, 667×375, 640×360, 768×1024, 1280×800.

| Prior finding | Verification | Result |
|---|---|---|
| C1 hint covers Mapillary credit / map search box | bounding-box intersection `hint × credit`, `hint × search` | **0 overlap at all 6 viewports** |
| H2 dialog scrim renders under game chrome | `elementFromPoint` at the action bar and at the minimap with the donate dialog open | topmost element is `data-slot="dialog-overlay"` (375 and 1280) — scrim now wins |
| H3 no left/right safe-area handling | `env(safe-area-inset-left/right)` present on the game header and content box | applied; no horizontal overflow introduced |
| H4 32px dismiss target | measured | 44×44 at every viewport |
| M5 4px gap search ↔ collapse button | measured on the expanded minimap | 12px |
| M6 expanded minimap has no Escape / focus | interaction test | focus lands on "Collapse the guess map" on open; Escape collapses |
| M7 "Loading map…" invisible in the minimap | `min-h-[400px]` removed from the `dynamic` fallback | fixed |
| L1 dead `z-[600]` at `lg` | computed style | action bar `z-index: 30` below `lg`, `auto` at `lg` |
| L2 portals as `body` flex items | column moved to a wrapper `<div>` | fixed |
| L3/L5 duplicated footer/action-bar constants | `--footer-h: 2.25rem`, `--action-bar-h: 4.5rem` resolve at runtime; consumed by the landing FAB and both minimap states | fixed |
| z-ladder replaces `!important` 9999 | emitted CSS carries `.z-\(--z-appbar\){z-index:var(--z-appbar)}` etc.; `[role="dialog"]{z-index:9999!important}` gone | fixed |

Also correct and worth noting: `@import "tailwindcss" source("../")` scopes class detection to `src/`, so prose in `plans/` quoting a class name can no longer emit invalid CSS and break the build. Verified the build still emits every var-shorthand utility used (`z-(--z-*)`, `min-h-(--footer-h)`, `bottom-[calc(var(--action-bar-h)+0.75rem)]`).

`prefers-reduced-motion` still neutralises `animate-fade-in-up`, so moving the hint into flow did not lose that.

## Debug/coverage redesign

Beyond the prior audit's scope, but verified:

- Desktop 1280×800: map keeps the full surface (1280×606); inspector floats as a 416×582 panel inset 12px from the right. The clicked dot does not move — the stated goal. Tile attribution relocated to bottom-left and stays visible under the panel.
- Phone 375×667: inspector takes the surface (375×285), map unmounts visually but stays mounted; `ResizeObserver` re-measures on return. Escape closes the inspector.
- The `ResizeObserver` zero-size guard is correct: it skips while the map is `display:none`, so no degenerate bbox is sent to the loader.

## Fixed during this review

1. **`FirstRoundHint.js`** — `justify-end` → `justify-start`. At 640×360 landscape the right-aligned dismiss button's bottom 9px sat under the collapsed minimap (measured 39×9px overlap); 667×375 cleared it by only 1.5px, i.e. the layout was at the failure boundary. Left-aligning the row puts the button 41px clear at 640×360 and changes nothing at any other viewport (the span already fills the available basis from `lg`). Re-measured: 0 overlap at all 6 viewports.
2. **`GuessMapPanel.js`** — removed `aria-expanded={expanded}` from the "Expand the guess map" cover. The cover only renders while collapsed, so the attribute was permanently `"false"` and told a screen reader nothing.
3. **`coverage/page.js`** — the new Escape handler now ignores the keypress while a Radix popper is open, so closing the region select does not also close the inspector. Matches the `[role="dialog"]` guard `GuessMapPanel` already had.
4. **`DebugFooter.js`** — comment said the tap target is "~44px tall"; it is `--footer-h` (36px). Corrected so the comment does not contradict the code.

Re-ran build, lint and tests after these edits: all still green.

## Fixed in the follow-up pass

The two items previously left as product calls were fixed, plus one defect the
first fix exposed. All re-measured live at 360/375/640/667/768/1280.

5. **`coverage/page.js`** — the map surface now carries `min-h-64` (256px) below
   `lg`. The page chrome takes 225px, so a purely flexed surface collapsed to
   98px at 640×360. With the floor, `<main>` scrolls instead of shrinking the
   map below the point of being one. Measured: map 256px at both landscape
   phone sizes (was 98/113), document scrolls 143-158px there and nowhere else,
   footer still reachable, `/game` still never scrolls at any viewport.

6. **`GuessMapPanel.js`** — Leaflet's chrome is sized for a full map, so each
   phone state now gets what fits:
   - Collapsed (a 144px thumbnail behind an opaque "Tap to guess" cover): tile
     credit and zoom buttons hidden. The credit wrapped to five lines across
     the thumbnail and the zoom buttons landed on the cover's own label; the
     cover intercepts every click regardless. Measured `display: none` at all
     five sub-`lg` viewports, `block` at 1280.
   - Expanded: both come back (`display: block`), with the bottom-left zoom
     control lifted 36px so the two-line credit no longer covers the `−`
     button. This was a defect the credit fix exposed, not a pre-existing one.
   - Both rules scoped `max-lg`, verified in the emitted CSS as
     `@media not all and (min-width:64rem)`.

7. **`GuessMapPanel.js`** — the desktop "Click to place your guess" badge moved
   from `bottom-3` to `bottom-8`. Its opaque background covered the tile credit
   along the map's bottom edge. Measured: 0 intersection at 1280×800, full
   credit string legible.

8. **`credits/page.js`** — added the OpenMapTiles credit alongside Geoapify.
   The Geoapify free plan requires all three credits (Geoapify, OpenMapTiles,
   OSM) and the page carried only two, which matters more now that the credit
   is suppressed on the collapsed thumbnail.

Gates after this pass: build passes, lint 0 errors (same 19 pre-existing
warnings), 233/233 tests pass. Every overlap probe on `/game` returns null at
all six viewports.

## Notes on the attribution decision

Suppressing the tile credit on the collapsed minimap is a judgment call, made
on these grounds: the thumbnail is not a usable map display (144px, behind an
opaque cover that swallows interaction), the full credit appears on the
expanded map one tap away and on desktop at all times, and `/credits` carries
the permanent Geoapify + OpenMapTiles + OSM attribution. If the licensing
review wants the credit on the thumbnail unconditionally, the alternative is
shortening the string so it fits one line, which weakens the OSM guideline
instead.

## Unresolved questions

1. Is landscape phone a supported orientation for `/game`? The panorama gets ~180px of unobstructed height at 640×360 after header, hint, action bar and credit strip. It is usable, but it is the tightest surface in the app.
2. `/debug/coverage` in landscape phone now scrolls rather than fitting. Acceptable for a desktop-first debug tool, or should the counters row collapse below `sm` to keep it a fixed surface?
3. Does the attribution decision above need sign-off from the licensing review before shipping, given the Geoapify swap already on that list?
