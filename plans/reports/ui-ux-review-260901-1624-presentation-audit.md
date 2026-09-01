# VNGeoGuessr UI/UX Presentation Audit

Date: 2026-09-01 · Scope: presentation/UX only, read-only. All current features stay; no breaking changes proposed.

Overall: the app is in strong shape — token-driven palette (`--brand` VN red), 44px touch floor baked into Button, mobile minimap pattern, honest error states, reduced-motion handling, careful a11y comments. Findings below are refinements, ranked by impact on a first-time player.

---

## 1. First-time journey (highest impact)

### F1. No way to change username after first save — HIGH
`UsernameModal` only opens when `getUsername()` is empty (`src/app/page.js:42-49`). A player who typos their name or skipped is stuck as-is/Anonymous forever; the "Playing as **X**" text (`page.js:68-72`) is inert and hidden below `sm`, so mobile players never even see confirmation their name saved.
- **Fix (quick win):** make "Playing as X" a button that reopens `UsernameModal`; show it on mobile too (it fits as a chip). When skipped, render "Playing as Anonymous — set name". Files: `src/app/page.js`, `src/app/components/UsernameModal.js` (accept an initial value).

### F2. Username modal ambushes on landing, and its CTA lies — HIGH
The modal opens before the newbie has seen the game (`page.js:47`). Its primary button says **"Start Playing"** but only saves the name and returns to the homepage — expectation break #1 for every new player. "Skip" gives no hint you'll play as Anonymous.
- **Fix (quick win):** relabel "Start Playing" → "Save name" (or "Let's go" if you keep it pre-game); relabel "Skip" → "Skip — play as Anonymous". File: `src/app/components/UsernameModal.js:90-104`.
- **Fix (flow, medium):** defer the prompt to the first Play click (open modal, then navigate on save/skip) so the landing page introduces the game first. Files: `page.js`, `RegionPicker.js` (intercept first navigation) — keeps the feature, changes only when it appears.

### F3. Zero in-game onboarding; deep-linked players see nothing — MEDIUM-HIGH
All instruction lives on the homepage card. A player who lands on `/game?region=…` (shared link) gets a panorama with no hint that it drags/rotates, and on desktop no hint that the right map is clickable (mobile at least says "Tap to guess"). The scoring ladder is never explained before the first result.
- **Fix (quick win):** a one-time dismissible hint overlay on the game screen, gated by localStorage (`vngg-hint-seen`): "Drag to look around · Click the map to drop your guess · Submit". Auto-dismiss on first map click. Files: `src/app/components/GameClient.js` (+ ~30 lines, or a tiny `FirstRoundHint.js`).
- Desktop guess map could also carry a transient "Click to place your guess" ghost label until `hasGuess` — mirror of the mobile cover in `GuessMapPanel.js:76-86`.

### F4. No sense of progress during a session — MEDIUM
The game header shows only region + theme + donate. Rounds played and points earned this session are invisible until the result dialog, and even there only as leaderboard totals. Newbies have no feedback loop ("am I improving?").
- **Fix (medium):** client-side session counter in `GameClient` state (rounds, points sum from each submitted result) shown as a small badge in the header next to the region. Purely additive, no API change. File: `src/app/components/GameClient.js:393-398`.

### F5. Skip is unexplained — LOW
"Skip" sits beside Submit with no hint it's penalty-free (`GameClient.js:487-494`). A cautious newbie hesitates.
- **Fix (quick win):** `title="Skip this location — no penalty"` + aria-label; or label "Skip ↻".

---

## 2. Round result readability

### F6. The reveal is buried and unlabeled — HIGH
`RoundResultDialog.js` renders the resolved region path as plain muted text (`:153-157`) — this is the emotional payoff of the round ("it was District 7!") and it reads like a footnote. The map, the second payoff, is last and below the fold on most screens. The bands strip (`:121-145`) shows `≤240m = 5` chips with no heading — cryptic on first sight.
- **Fix (quick win):**
  - Give the path a label and weight: small caption "It was in" + the path in `font-semibold text-foreground`.
  - Caption the bands strip: "This round's scoring ladder" in the same `text-[10px] uppercase tracking-wider` style used elsewhere.
  - Reorder body: score circle → distance → **map** → path → ladder → leaderboard cards. File: `RoundResultDialog.js:85-212`.

### F7. Leaderboard level cards are unexplained and visually competing — MEDIUM
Three brand-subtle cards ("Total: 37 (+2)") followed by muted "X distance Rank #n" cards (`:162-195`). Nothing says these are *leaderboard* credits, and the `(+2)` differing from the headline score (by design — per-board ladders) will read as a bug to a newbie.
- **Fix (quick win):** captions above each grid: "Leaderboard points added" / "Best-distance ranks"; tooltip/`title` on the `(+N)` — "each board grades your distance on its own scale". File: `RoundResultDialog.js`.
- **Fix (medium):** collapse both grids into one `<details>`/accordion "Leaderboard results" section, shortening the dialog to score + map + path at a glance.

### F8. Result map markers: red/green pair with no legend — MEDIUM (a11y)
Guess = red dot, actual = green dot (`ResultMap.js:42-70`), distinguishable only via click-popups; red/green is the classic deuteranopia trap, and red doubles as the brand color. Meanwhile the in-game guess pin is Leaflet's *blue* marker — the guess changes color between screens.
- **Fix (quick win):** add a legend row above/below the map ("● Your guess ● Actual location") and switch the guess dot to blue (matching the in-game pin) or add distinct shapes (pin vs flag). Files: `ResultMap.js`, small legend in `RoundResultDialog.js`.

### F9. Tone mismatch between label and message — LOW
Score 4 shows label "Excellent" (`:20-27`) but message "Good job! Nice work!" (`:30-35` uses `> 4` / `> 2` cutoffs). Align cutoffs or derive the message from the same band. File: `RoundResultDialog.js`.

### F10. Score circle contrast — LOW
White 3xl text on `bg-amber-600` (~3.0:1) and `bg-orange-600` is borderline even for large text (`:10-17`). Darken those two steps or use dark text on amber. File: `RoundResultDialog.js`.

---

## 3. Region picker comprehension

### F11. The bare pano count is a mystery number — MEDIUM
Each PlayRow shows e.g. `225,966` with no unit (`RegionPicker.js:69`). A newbie can't tell if it's players, points, or size.
- **Fix (quick win):** append a label — `225,966 spots` / `locations` — or a `title` attribute at minimum. File: `RegionPicker.js`.

### F12. "partial" and "few streets" badges unexplained — LOW
(`RegionPicker.js:62-66, 140-144`). Add `title="Street imagery covers only part of this province"` / `"Limited street imagery — repeats are likely"`. Quick win.

### F13. Disabled rows read fine; keep them — no change
"no map data" / "no street view" honest labels + dashed border are good practice. Optionally capitalize for polish.

---

## 4. Consistency audit

### F14. Dialog patterns diverge — MEDIUM
- Titles: RoundResult/Leaderboard/Donate use `text-2xl text-center`; Username uses `text-xl` left-aligned (`UsernameModal.js:55`).
- Descriptions: RoundResult has an sr-only `DialogDescription`; Username has a visible one; **Donate and Leaderboard have none** (Radix logs a warning, screen readers get no context). Files: `DonateQRModal.js`, `LeaderboardModal.js`.
- Dismissal: Donate has an explicit "Close" button *plus* the X; others rely on X only.
- **Fix (quick win):** one convention — centered `text-2xl` title + a `DialogDescription` (sr-only where visually redundant) in every dialog; drop Donate's redundant footer Close or adopt footer actions everywhere.

### F15. Hardcoded palette classes bypass the token system — MEDIUM (refactor)
The design system comments insist on `--brand` tokens, but result/leaderboard semantics use raw Tailwind colors with hand-managed dark variants:
- `RoundResultDialog.js` `getScoreBg` (green/emerald/amber/orange/red/neutral), `leaderboardMessage` green (`:198`);
- `LeaderboardList.js` `DISTANCE_COLORS`, `getScoreColor` (a 6-step purple→red rainbow keyed to arbitrary totals), amber "YOU" highlight (`:87, 101-105`);
- `ResultMap.js` inline hex `#ef4444/#22c55e/#da251d`.
- **Fix (larger):** add semantic tokens in `globals.css` (`--success`, `--warning`, `--rank-gold` …, plus dark values) and map these call sites onto them. Also simplify `getScoreColor` — the rainbow carries no meaning; two states (top-3 tint + default) or a single neutral would read cleaner.

### F16. ThemeToggle breaks its own touch-target rule — LOW
Buttons are `h-11 w-9` = 36px wide (`ThemeToggle.js:57`), below the 44px floor `button.jsx` documents. Widen to `w-11`. Also: three emoji buttons with `bg-brand` selection is visually noisier than the rest of the chrome; a Lucide sun/moon/monitor set would match the Trophy/Wrench/ArrowLeft icon language (`page.js` uses 🍺 emoji too — pick one icon language, Lucide is already the majority).

### F17. Marker language: play vs result — covered in F8.

### F18. `vn-gradient-bg` is not a gradient — TRIVIAL
`globals.css:212-214` maps it to flat `--surface`. Rename to `.vn-surface` (or fold into `bg-surface` utility) whenever files are next touched — misleading names invite wrong reuse.

### F19. Credits page chrome differs from home — LOW
No ThemeToggle on `/credits` (`credits/page.js:38-45`), and the header drops the actions row entirely. Fine minimal page, but add ThemeToggle for parity (theme still applies, just no switch), and "Back to game" actually goes to the homepage — label it "Back to home" or "← Home".

### F20. Vietnamese glyph fallback in search results — LOW
Geist loads `subsets: ["latin"]` only (`layout.js:8-16`). All UI region names are ASCII, but Photon search results (`MapSearchBox.js`) return labels with Vietnamese diacritics (Đường, Phường…), which will render in the fallback system font — a subtle ransom-note effect inside the dropdown. If/when Geist offers a `vietnamese` subset, add it; otherwise consider Be Vietnam Pro or Inter (both support Vietnamese) if Vietnamese-language UI ever expands.

---

## 5. Flow improvements (all features preserved)

Ordered, concrete, non-breaking:

1. **Move the username prompt to the first Play click** (F2) — landing page becomes pure introduction; the modal appears exactly when the name is about to matter. Home still shows "Playing as X / set name" chip (F1).
2. **Result dialog restructure** (F6/F7): score → distance → map → reveal path → collapsible "Leaderboard results" containing bands + level cards. Shortens the payoff screen to one viewport on phones; all data stays.
3. **First-round hint overlay** on `/game` (F3) — one-time, localStorage-gated.
4. **Session progress badge** in the game header (F4).
5. **Mobile expanded-map peek** (optional, larger): when the map is expanded, keep a small panorama thumbnail in a corner (inverse of the current minimap) so players can cross-check without collapsing. `GuessMapPanel.js` already has the swap pattern; this mirrors it. Defer unless players ask.

---

## Quick wins vs larger refactors

| # | Item | Size | Files |
|---|------|------|-------|
| F1 | Clickable "Playing as X" reopens username modal, visible on mobile | QW | `page.js`, `UsernameModal.js` |
| F2a | Relabel modal buttons ("Save name" / "Skip — play as Anonymous") | QW | `UsernameModal.js` |
| F5 | Skip tooltip | QW | `GameClient.js` |
| F6 | Label the reveal path + bands caption + reorder map up | QW | `RoundResultDialog.js` |
| F7a | Captions on leaderboard grids | QW | `RoundResultDialog.js` |
| F8 | Result-map legend + blue guess dot | QW | `ResultMap.js`, `RoundResultDialog.js` |
| F9/F10 | Message-band alignment, amber contrast | QW | `RoundResultDialog.js` |
| F11/F12 | Label pano counts; badge tooltips | QW | `RegionPicker.js` |
| F14 | Unify dialog titles/descriptions | QW | `UsernameModal.js`, `DonateQRModal.js`, `LeaderboardModal.js` |
| F16 | ThemeToggle 44px width | QW | `ThemeToggle.js` |
| F19 | Credits parity | QW | `credits/page.js` |
| F2b | Defer username modal to first Play | Medium | `page.js`, `RegionPicker.js` |
| F3 | First-round hint overlay | Medium | `GameClient.js` (+ small component) |
| F4 | Session progress badge | Medium | `GameClient.js` |
| F7b | Collapsible leaderboard section in result dialog | Medium | `RoundResultDialog.js` |
| F15 | Semantic color tokens (success/warning/rank) replacing raw Tailwind colors | Larger | `globals.css`, `RoundResultDialog.js`, `LeaderboardList.js`, `ResultMap.js` |
| F16b | Emoji → Lucide icon unification | Larger (cosmetic) | `ThemeToggle.js`, `page.js`, `GameClient.js`, `DonateQRModal.js` |
| F20 | Vietnamese font subset/pairing | Larger (deferred) | `layout.js` |

## Unresolved questions

- Is the pano count on PlayRows meant as a player-facing signal (bigger = more variety) or a debug leftover? Answer decides F11's label vs removal-from-view (kept as `title` only).
- Should Anonymous play be encouraged (frictionless first round) or discouraged (leaderboard identity)? Decides how prominent the F2b deferral makes the name prompt.
- Is there interest in a session summary ("You played 8 rounds, 23 pts") when leaving via Menu? It would complete the F4 loop but adds a new surface — not proposed without a nod.
