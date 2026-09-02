# Game screen — overlap / layering / spatial-collision audit

Date: 2026-09-02 · Scope: `/game` (GameClient tree) · Report only, no source touched.
Standards cited from `ak-ui-ux-pro-max` `data/ux-guidelines.csv` (no numeric ids in that CSV — cited as `ux/<Category>/<Issue>`).

## Measured box model (used throughout)

Derived from the classes in the tree, not guessed:

| Band | Height | Source |
|---|---|---|
| Header | 60px + `safe-area-inset-top` | `py-2` (16) + tallest child `min-h-11` (44) — GameClient.js:399 |
| Footer strip | 44px + `safe-area-inset-bottom` | `min-h-11` links + `pb-[env(...)]` — DebugFooter.js:34,39 |
| Game content | `100dvh − 104 − insets` | `flex-1 min-h-0` between them |
| Action bar | 72px | `p-3` (24) + `size="lg"` = `h-12` (48) — GameClient.js:509, button.jsx:44 |
| Minimap (collapsed) | 144px tall, top edge at `content − 228` | `h-36` + `bottom-[5.25rem]` (84) — GuessMapPanel.js:49,50 |
| Hint banner | 48px tall at y 12..60 | `top-3` + `py-2` (16) + `size-8` close (32) — FirstRoundHint.js:50,64 |

Viewport budgets: 375×667 → content 563px. 360×640 → 536px. **667×375 landscape → 271px. 640×360 landscape → 256px.**

---

## CRITICAL

### C1 — Hint banner is a free-floating overlay in a box two other elements already own

**Symptom.** "Drag to look around · … · Submit" is painted over / clipped on the game screen.

**Files.** `src/app/components/FirstRoundHint.js:50` · `src/app/components/GameClient.js:446-449` · `src/app/components/GuessMapPanel.js:49,68` · `src/app/components/PanoramaViewer.js:108`

**Root cause — two distinct collisions, one shared cause.**

The banner is `absolute left-1/2 top-3 -translate-x-1/2` inside the **whole game-content box** (`GameClient.js:446`, `relative flex-1 … lg:grid lg:grid-cols-2`). Nothing reserves that box for it; three other elements are positioned into the same coordinates.

*Desktop (`lg`), the reported case — the banner loses the stacking fight.*
- Banner is centred on the **grid container**, i.e. on the gutter between the two columns. Its intrinsic width (`w-max`, one line at `lg`) is ≈510px (63 chars @14px + `pl-4` + `pr-2` + `gap-2` + 32px close), so it reaches ≈255px into the **map column**.
- `MapSearchBox`'s wrapper is `absolute top-3 left-3 w-72 z-[1200]` (`GuessMapPanel.js:68`) → x = colLeft+18 .. colLeft+306, y = 24..68.
- Overlap at 1280px wide: x 646..895, y 24..60. At 1024px it is worse (≈243px of horizontal overlap) because the banner width is fixed while the column narrows.
- **Why the search box wins:** `GuessMapPanel` is `absolute z-[500]` on phones (a stacking context, which clamps its `z-[1100]`/`z-[1200]` children) but `lg:relative lg:z-auto` (`GuessMapPanel.js:49`). `position:relative` + `z-index:auto` creates **no** stacking context, and neither does the `lg:flex` wrapper (`GameClient.js:496`) nor the `relative` grid (`GameClient.js:446`) — all `z-auto`. So at `lg` the search box's `1200` escapes into the **root** stacking context and beats the banner's `700` directly. Same escape applies to Leaflet's `.leaflet-top/.leaflet-bottom` (`z-index:1000`) and `.leaflet-control` (`800`) — currently harmless only because `overflow-hidden` on the panel clips them inside the panel box.

*Mobile — the banner wins and buries a legally required credit.*
- Mapillary attribution: `absolute top-2 left-2 z-10` (`PanoramaViewer.js:108`), x 8..≈135, y 8..≈30.
- Banner at 375px: `max-w-[calc(100%-1.5rem)]` = 351px, text ≈455px → wraps to 2 lines, box x 12..363, y 12..≈68.
- Banner (`z-[700]`, same root stacking context, `bg-card/95` opaque) **covers the attribution**. `PanoramaViewer.js:103-107` states the credit is required by the Mapillary ToU ("visibly displayed"). This is a compliance regression, not just cosmetics.

*Landscape phone — the banner also lands on the minimap.* See H1.

**Ruled out (checked, so nobody re-checks):** `animate-fade-in-up` (globals.css:266-278, `forwards`) animates `transform`, while Tailwind v4.3.3 compiles `-translate-x-1/2` to the standalone `translate` property (verified in `node_modules/tailwindcss/dist/lib.js`: `["translate","var(--tw-translate-x) var(--tw-translate-y)"]`). They compose; centring is **not** broken by the animation. The clipping is geometric, not transform-related.

**Fix — layout-level, no z-index change. Give the hint a flow cell that already excludes its neighbours.**

*Option A (recommended — costs zero vertical budget, fixes both collisions at once).* Put the hint into the panorama pane's **top bar**, in flow beside the Mapillary credit. That confines it to the panorama column on `lg` (so it can never reach the map column) and makes it a flex sibling of the credit on phones (so it can never cover it). `PanoramaViewer` keeps ownership of the credit (it is also used by `src/app/debug/coverage/page.js:235`), and gains one slot prop:

```jsx
// PanoramaViewer.js — the credit and any host-supplied chrome share one flow
// row. Two absolutely-positioned overlays in the same corner is how the
// how-to-play banner ended up covering an attribution the Mapillary ToU
// requires us to keep visible; a flex row cannot produce that state at all.
function PanoramaViewer({ imageUrl, onReady, onError, topBarSlot }) {
  // ...
  <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start gap-2 p-2">
    <div className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-md bg-black/50 px-2 py-1">
      {/* existing Mapillary logo + CC link, unchanged */}
    </div>
    {topBarSlot ? <div className="pointer-events-auto min-w-0 flex-1">{topBarSlot}</div> : null}
  </div>
}
```

```jsx
// GameClient.js — the hint rides in the panorama's own top bar, so it shares a
// row with the credit instead of a coordinate space with it, and on lg it is
// physically inside the panorama column, out of the map search box's reach.
<PanoramaViewer
  key={roundKey}
  imageUrl={imageData.url}
  onReady={handlePanoramaReady}
  onError={handlePanoramaError}
  topBarSlot={<FirstRoundHint hasGuess={Boolean(guessCoordinates)} />}
/>
```

```jsx
// FirstRoundHint.js — no position, no translate, no z-index. It is a flow item
// in the panorama top bar now; the layout, not a stacking value, is what keeps
// it off the credit and off the guess map.
<div
  role="note"
  aria-label="How to play"
  className="flex items-center justify-end gap-2 text-sm animate-fade-in-up"
>
  <span className="rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">…</span>
  <button className="… size-11 …">…</button>   {/* see M1: 32px is under the floor */}
</div>
```
`mapExpanded` can then be dropped from the props: with the hint inside the panorama pane, the expanded minimap (a sibling that covers the pane at `z-[500]`) occludes it naturally, so the `hidden lg:flex` special case and the comment at `FirstRoundHint.js:15-18` about a "z-clamped stacking context" both become dead.

*Option B (smaller diff, costs ~44px of an already tight budget).* Give the hint its own grid row between header and content:

```jsx
<div className="flex-1 min-h-0 vn-surface grid grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
  <header …/>
  <FirstRoundHint hasGuess={Boolean(guessCoordinates)} />   {/* auto row, collapses to 0 when it returns null */}
  <div className="relative min-h-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:p-3">…</div>
</div>
```
Collision-proof by construction, but it takes 44px from a 271px landscape content band (see H1), so prefer A.

---

## HIGH

### H1 — Landscape phone: hint, minimap and action bar all collide; the panorama is squeezed to a sliver

**Files.** `GameClient.js:509` · `GuessMapPanel.js:49-51` · `FirstRoundHint.js:50`

**Symptom.** At 667×375 the content band is 271px. The minimap's top edge sits at `271 − 228 = 43px`, the hint occupies y 12..60 and x 78..589 (centred, ≈510px wide), the minimap occupies x 523..655. → **17px of vertical × 66px of horizontal overlap**; the hint (`z-[700]`) paints over the minimap (`z-[500]`). At 640×360 the minimap top is 28px and the overlap grows to 32px. At 844×390 landscape it is a 2px graze — i.e. the layout is *at* the failure boundary on current phones, not near it.

**Root cause.** Three absolutely-positioned overlays measured from opposite edges of the same box, with no shared constraint. The minimap's height (`h-36`) and offset (`bottom-[5.25rem]`) are fixed pixels that never consult the available height, so as the band shrinks the minimap marches upward into the hint. Nothing clips first — they simply stack.

Secondary, and worse for play: at 271px the chrome consumes `48 (hint) + 144 (minimap) + 72 (action bar) = 264px` of vertical extent. Effective unobstructed panorama height between hint and action bar is ≈139px, and the right 40% of that is minimap.

**Fix.**
1. Option A of C1 removes the hint from this contest entirely (it becomes the panorama's top row).
2. Size the minimap against the band instead of hard-coding it, so it cannot climb:
```jsx
// The minimap is a preview, not a pane: cap it at a share of the band so a
// short landscape viewport shrinks it instead of pushing it up into the
// panorama chrome. 9rem stays the portrait size; the min() is what keeps
// 360px-tall landscape honest.
className={`… bottom-[5.25rem] right-3 h-[min(9rem,30vh)] w-[min(9rem,30vh)] …`}
```
3. Consider hiding the credit footer strip on the `/game` route in landscape (see M4) — it is 44px of a 271px budget.

### H2 — Dialog scrim renders *under* the game chrome

**Files.** `src/components/ui/dialog.jsx:41` (`z-50` overlay) vs `GameClient.js:509` (`z-[600]`), `GuessMapPanel.js:49` (`z-[500]`) · `src/app/globals.css:241-249`

**Symptom.** Open `RoundResultDialog` (or `DonateQRModal` from the game header): the action bar and the collapsed minimap keep full brightness on top of the black/50 scrim, while everything else dims. They are inert (Radix modal sets `pointer-events:none` on the body) so it reads as a rendering bug rather than an affordance.

**Root cause.** `globals.css:242` rescues only the **content** (`[role="dialog"] { z-index: 9999 !important }` — Radix puts `role="dialog"` on Content, not on Overlay). The overlay keeps shadcn's default `z-50`, which is below the game's ad-hoc 500/600. Portal DOM order does not help: an explicit `z-index` beats source order.

**Fix.** Bring the overlay into the same scale as the content and delete the `!important` escape hatches (see the ladder below). Concretely: overlay → `z-50`, content → `z-60`, popper → `z-70`, and drop `z-[500]/z-[600]` to `z-20/z-30`. No `!important` anywhere.

### H3 — No left/right safe-area handling anywhere

**Files.** grep of `src/`: only `safe-area-inset-top` (GameClient.js:399, debug/layout.js:16) and `safe-area-inset-bottom` (DebugFooter.js:34, page.js:223). No `-left` / `-right`.

**Symptom.** `viewport.viewportFit = "cover"` (`layout.js:29`) opts the app into the display cutout. In landscape on a notched iPhone the inset is 44–59px on one side: the header's Back button (`px-3`), the minimap (`right-3`), and the action bar (`p-3`) all sit under the notch or the rounded corner. The refactor to an in-flow footer covered the home indicator correctly but never addressed the horizontal axis — this predates the change and was not introduced by it.

**Fix.** Add the horizontal inset once, on the two elements that own the screen edges, rather than per-child:
```jsx
// viewportFit:cover means the layout owns the cutout on every axis, not just
// the top. In landscape the notch takes a 44-59px bite out of one side, which
// is exactly where Back and the minimap live.
<header className="… px-[calc(0.75rem+env(safe-area-inset-left))] pr-[calc(0.75rem+env(safe-area-inset-right))] …" />
<div className="relative flex-1 min-h-0 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:grid …" />
```
Padding the game-content box (rather than each overlay) means the minimap's `right-3`, the action bar's `inset-x-0` and the hint all inherit the inset for free.

### H4 — Hint dismiss button is 32×32

**File.** `FirstRoundHint.js:64` (`size-8`).

**Symptom.** The only explicit way to dismiss the banner is a 32px target sitting over the panorama; a missed tap starts a panorama drag instead. Violates `ux/Touch/Touch Target Size` (min 44×44, severity High).

**Fix.** `size-11` with the icon left at `size-4`; or make the whole banner the dismiss target (`<button>` wrapping the text, since the banner has no other action) — the latter is smaller and removes the adjacency problem in one step.

---

## MEDIUM

### M1 — The z-index ladder means different things per breakpoint

**Files.** `GuessMapPanel.js:49` (`z-[500] … lg:z-auto`), `:68` (`z-[1200]`), `:79` (`z-[1100]`), `:94`, `:106`.

`GuessMapPanel` is a stacking context **only below `lg`**. So `z-[1200]` is a panel-local value on phones and a global one on desktop. Every value inside the panel is therefore ambiguous, and C1 is the first symptom. Fix is structural: add `isolate` (`isolation:isolate`) to the panel at *all* breakpoints, which lets its children drop to single-digit values that can never leak.

### M2 — Two different layers both sit at 9999

`globals.css:242` (`[role="dialog"]`) and `:247` (`[data-radix-popper-content-wrapper]`) are equal, so a `Select`/`Popover` opened *inside* a dialog is ordered by portal insertion order alone. It happens to work today. Both rules are `!important`, so no component can correct it locally. Remove both once the overlay/content/popper carry real ladder values.

### M3 — Latent: emulated fullscreen escapes to 9999

`.psv-fullscreen-emulation { z-index: 9999 }` (`@photo-sphere-viewer/core/index.css`). The panorama pane (`GameClient.js:449`, `absolute inset-0`, `z-auto`) and `PanoramaViewer`'s root (`PanoramaViewer.js:101`, `relative`, `z-auto`) create no stacking context, so PSV's internal ladder (50/80/90/100/110/9999) is global. The fullscreen button only exists at `lg` (`.psv-navbar` is hidden below it, `globals.css:235-239`), and Safari uses emulation — an emulated fullscreen panorama would tie with the dialog content. Fix: `isolate` on the panorama pane, same as M1.

### M4 — Footer strip taxes a fixed, non-scrolling surface

`DebugFooter.js:34` renders 44px + inset on every route including `/game`. In landscape that is 16% of the vertical budget for a credit line. The refactor is correct in principle (no more overlap, no z-index needed) but the game screen is the one route where the tax bites. Options, cheapest first: (a) shrink the footer to `min-h-8` and rely on the game header for the tap-sized credit; (b) render the credit inside the game header's overflow instead of a strip on `/game`; (c) leave it and accept H1's mitigation. This is a product call, not a defect — flagged because it changes the H1 math.

### M5 — Adjacent touch targets under the 8px floor

`ux/Touch/Touch Spacing` (min 8px gap, severity Medium):
- `GameClient.js:429` — header right cluster is `gap-1` (4px) between the ThemeToggle group and the "Buy me a beer" button. → `gap-2`.
- `GuessMapPanel.js:68` vs `:106` — expanded minimap: search box ends at `right-14` (56px), the collapse button occupies 8..52px from the right → **4px gap**. → `right-16` (64px), or move the collapse button to `top-2 left-2` and the search to `left-16`.
- `DebugFooter.js:34` — `gap-1` between the two `min-h-11` targets (the `·` sits between them). → `gap-2`.
- `ThemeToggle.js:67` — three 44px segments with no gap: acceptable as a segmented control, no change.

### M6 — Expanded minimap has no Escape, no focus management

`GuessMapPanel.js:89-110`. Expanding covers the screen with a map, but the state is a plain boolean: no `Escape` handler, no focus move into the panel, no focus restore to the "Tap to guess" cover on collapse, and the cover button carries no `aria-expanded`. It behaves like a modal without being one. Minimum fix: `aria-expanded={expanded}` on the cover, a keydown listener for `Escape` while expanded, and focus the collapse button on open.

### M7 — "Loading map…" is never visible in the collapsed minimap

`GuessMapPanel.js:10` — the `dynamic` loading fallback is `min-h-[400px]` inside a 144px `overflow-hidden` box, so its vertically-centred text renders at ~200px, off-box. The collapsed minimap shows an empty grey square while the chunk loads. Fix: drop `min-h-[400px]` from the fallback (the parent already sizes it) — `LeafletMap`'s own default `className` is overridden by the caller at `:61`, so only the fallback carries the stale minimum.

---

## LOW

- **L1** `GameClient.js:509` — `z-[600]` is kept at `lg` where the element becomes `lg:static`; `z-index` on a static box does nothing, so the class is dead but it will start mattering the moment someone adds `relative`. Pair it with `lg:z-auto` like `GuessMapPanel` does, or drop it once the ladder lands.
- **L2** `layout.js:56-58` — `body` is `flex flex-col`, so every Radix portal `<div>` appended to `body` becomes a flex item after the footer. Their children are `fixed` (out of flow) so the items measure 0 and nothing shifts today, but any portal that ever renders in-flow content would insert a row below the footer. A `<div>` page wrapper carrying the flex column, with portals landing outside it, is more robust.
- **L3** `page.js:223` — the landing FAB's `bottom-[calc(3.75rem+env(safe-area-inset-bottom))]` hard-codes 60px against a footer that is actually 44px + inset. 16px of clearance, correct today, but it is a duplicated constant. A shared `--footer-h` token removes the drift.
- **L4** `FirstRoundHint.js:47-49` — `role="note"` is not announced when the banner appears post-hydration. `role="status"` (or `aria-live="polite"`) makes the one-time instruction reachable to screen-reader users who are already past the header.
- **L5** `GuessMapPanel.js:49-51` — expanded panel bottom is `5.25rem` (84px) while the action bar is 72px, leaving a 12px strip of panorama between them. Cosmetic; a single shared offset token fixes it with M4/L3.

---

## Proposed z-index ladder

One scale for the whole app, single-digit-tens only, enforced by **isolation** rather than by escalation. Third-party ladders (Leaflet 200–1000, PSV 50–9999) are not negotiated with — they are contained.

| Token | Value | Owns | Replaces today |
|---|---|---|---|
| `--z-base` | `0` | panorama canvas, map tiles | implicit |
| `--z-pane-chrome` | `10` | Mapillary credit, map search box, "Click to place your guess", minimap tap cover, collapse button, round-loading scrim | `z-10`, `z-[1100]`, `z-[1200]` |
| `--z-floating` | `20` | phone minimap panel | `z-[500]` |
| `--z-appbar` | `30` | game action bar, sticky headers | `z-[600]` |
| `--z-fab` | `40` | landing debug FAB | `z-40` (unchanged) |
| `--z-overlay` | `50` | dialog scrim | `z-50` (unchanged — but now above everything below it) |
| `--z-modal` | `60` | dialog content, drawer content | `9999 !important` |
| `--z-popover` | `70` | Radix popper wrapper (select/tooltip inside a modal) | `9999 !important` |
| `--z-toast` | `80` | future toasts | — |
| — | none | **the how-to-play hint** | `z-[700]` deleted |

Two rules make it hold:

1. **Every floating pane is `isolate`.** `GuessMapPanel` root and the panorama pane get `isolation: isolate` at *all* breakpoints (Tailwind `isolate`). Leaflet's `.leaflet-top` at 1000 and PSV's `.psv-fullscreen-emulation` at 9999 then cannot leave their pane, and the pane's own children can use `z-10` honestly. This is what `ux/Layout/Stacking Context` asks for ("understand what creates a new stacking context") and what `ux/Layout/Z-Index Management` (severity High: "define z-index scale system (10 20 30 50)", "don't use arbitrary large z-index values") prescribes instead of the current `z-[9999]` anti-pattern it names verbatim.
2. **No `!important` z-index.** `globals.css:241-249` both go; the values move onto `dialog.jsx`'s overlay/content, so a component can still override locally.

Nothing above `--z-pane-chrome` is needed for the hint, because after C1 the hint is in flow.

---

## Implementation checklist (smallest safe step first)

1. `FirstRoundHint.js:64` — bump the dismiss button to `size-11` (H4). One class, no layout dependency.
2. `GameClient.js:429`, `DebugFooter.js:34` — `gap-1` → `gap-2` (M5). `GuessMapPanel.js:68` — `right-14` → `right-16` (M5).
3. `GuessMapPanel.js:10` — drop `min-h-[400px]` from the `dynamic` loading fallback (M7).
4. `dialog.jsx:41,60` — overlay `z-50`, content `z-60`; then delete `globals.css:241-249` (H2, M2). Verify with RoundResultDialog + DonateQRModal open over the game screen — the scrim must dim the action bar and minimap.
5. Add `isolate` to `GuessMapPanel.js:49` (all breakpoints) and to the panorama pane `GameClient.js:449`; then lower `z-[1200]`/`z-[1100]` → `z-20`/`z-10`, `z-[500]` → `z-20`, `z-[600]` → `z-30` and add `lg:z-auto` to the action bar (M1, M3, L1). Regression-check: Leaflet zoom control, search dropdown, and the "Tap to guess" cover must still sit above map tiles.
6. **C1 fix.** Add `topBarSlot` to `PanoramaViewer`, wrap the Mapillary credit in the flow top bar, pass `<FirstRoundHint>` from `GameClient`, and strip `absolute/left-1/2/top-3/z-[700]/-translate-x-1/2/mapExpanded` from `FirstRoundHint`. Re-verify the credit is visible with the hint up at 375×667. (Fallback: Option B grid row, if the slot prop is judged too much coupling.)
7. `GuessMapPanel.js:49` — `h-36 w-36` → `h-[min(9rem,30vh)] w-[min(9rem,30vh)]` (H1). Verify 667×375 and 640×360 landscape.
8. `GameClient.js:399,446` — add `env(safe-area-inset-left/right)` padding to the header and the game-content box (H3). Verify on a notched device in landscape, both orientations of the notch.
9. `GuessMapPanel.js:89-110` — `aria-expanded` on the cover, `Escape` to collapse, focus the collapse button on expand (M6).
10. Optional, product call: footer height on `/game` (M4) plus a shared `--footer-h` token consumed by `page.js:223` and `GuessMapPanel.js`'s bottom offset (L3, L5).
11. Optional: move the flex column off `body` onto a page wrapper so portals land outside it (L2).

Steps 1–5 are independent of C1 and can ship first; step 6 depends on 5 only for tidiness, not correctness.

---

## Unresolved questions

1. **Footer on `/game`.** Is the 44px credit strip acceptable on a 271px landscape band, or should `/game` get a compact variant? M4 and H1's severity both hinge on this.
2. **`topBarSlot` coupling.** Option A adds a slot prop to `PanoramaViewer`, which `src/app/debug/coverage/page.js:235` also renders. Acceptable, or prefer Option B's dedicated grid row and eat the 44px?
3. **Landscape as a supported orientation.** H1 is only critical if landscape phone is in scope. If it is not, is an orientation hint acceptable, or must the layout hold?
4. **Mapillary ToU exposure.** The credit has been coverable by the hint on phones for as long as both have existed. Does the fix need to be treated as a compliance item (i.e. shipped ahead of the rest) rather than a UI polish item? Ties into the ads/licensing note in project memory.
5. **`ThemeToggle` segmented control** keeps 0-gap 44px segments. Confirming that stays as-is.
