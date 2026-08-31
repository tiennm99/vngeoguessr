# VNGeoGuessr UI/UX Audit

Date: 2026-08-31 | Scope: home → region pick → panorama → guess → result → leaderboard. Advisory only, no code changed. Debug pages out of scope.

## Overall Assessment

Codebase shows unusually strong UX discipline for a hobby project: tokenized theme system with documented rationale (globals.css:96-119), 44px touch-target floor baked into button variants (button.jsx:38-45), honest error states ("Round Not Recorded" instead of fake 99999m miss, RoundResultDialog.js:70-81; leaderboard outage not shown as empty board, LeaderboardModal.js:44-56), reduced-motion respected incl. count-up (use-count-up.js:37-43), combobox ARIA on map search (MapSearchBox.js:124-128). Findings below are mostly flow-level gaps, not craft gaps.

---

## CRITICAL

### C1. Submitting a guess replaces the entire game screen with a mislabeled full-screen spinner
- Evidence: `handleSubmitGuess` sets `loading=true` (GameClient.js:158) and the component early-returns the full-screen loader whenever `loading` (GameClient.js:233-243) whose copy is **"Loading panoramic image..."** — wrong verb for scoring a guess. Side effects: PanoramaViewer and LeafletMap unmount, then remount when the result dialog opens (texture re-fetch, map re-init, guess pin visually rebuilt). The in-button loading state `'Processing...'` (GameClient.js:322) and the `loading` spinner prop (GameClient.js:320) are unreachable — the early return swaps the whole tree first.
- Impact: every single round ends with a jarring white-out + wrong message; wasted re-render of the heaviest components in the app; the carefully built button spinner never renders.
- Recommendation: split state into `initialLoading` vs `submitting`. Only initial load uses the full-screen loader; submit keeps the game view mounted and lets the existing button `loading` prop + disabled state do the work. Copy for any submit indicator: "Scoring your guess…".

### C2. Panorama-load failure is a native `alert()` followed by a dead end disguised as loading
- Evidence: fetch failure calls `alert('Failed to load street view image…')` (GameClient.js:81) with `imageData=null`; the game then renders a permanent "Loading panorama..." placeholder (GameClient.js:294-298) that never resolves. Submit is disabled; the only recovery is discovering that Skip re-fetches. Same path fires on a failed "Next Round".
- Impact: blocking OS-styled alert breaks immersion and theming; after dismissal the screen lies (says loading, nothing is loading). On mobile the player is stranded.
- Recommendation: replace `alert` with an in-panorama error state: "Couldn't load this street view" + `Retry` and `Back to menu` buttons. Never render "Loading…" when no request is in flight.

### C3. Result dialog is dismissible into a dead round
- Evidence: `onOpenChange={() => setShowResult(false)}` (GameClient.js:338); DialogContent renders a visible X close by default (dialog.jsx:65-71); Radix also closes on Esc/overlay. Session was already consumed server-side (atomic DEL on guess — docs/game-flow.md:50-51). After dismissal the player sees the old panorama, `guessCoordinates` still set, Submit enabled reading "Submit Guess" (GameClient.js:315-323); pressing it hits a dead session → misleading "Round Not Recorded".
- Impact: an obvious affordance (X / Esc) leads to a trap state whose failure message blames the wrong thing.
- Recommendation: pass `showCloseButton={false}` and either make `onOpenChange` a no-op (force choice between Next Round / Menu) or treat dismiss as "Next Round". Alternatively keep the round screen but disable Submit and surface "Round finished — start the next round".

---

## HIGH

### H1. Core mechanic is pointer-only — keyboard users cannot play
- Evidence: guess placement exists only as a Leaflet `map.on('click')` handler (LeafletMap.js:65-83); no focusable pin-placement alternative. Panorama look-around is drag/wheel only (PanoramaViewer.js:47-61; PSV navbar keyboard zoom hidden below lg, globals.css:196-200). Mobile "Tap to guess" cover is a `<button>` (good) but leads to a map that still needs a click.
- Impact: WCAG 2.1.1 (Keyboard) failure on the app's primary function.
- Recommendation: minimum viable fix — when the map has focus, let Enter/Space drop the pin at map center with a visible crosshair, arrows to pan (Leaflet has built-in keyboard pan/zoom; keep `keyboard: true` and add a "press Enter to place guess at crosshair" mode). Also let the search box place-then-confirm: after selecting a result, offer "Place pin here".

### H2. Username is a one-shot decision — no way to view/change it later
- Evidence: modal opens only when localStorage is empty (page.js:27-34); "Playing as {username}" is a non-interactive span hidden below `sm` (page.js:53-57); Esc/Skip on first run silently commits the player to "Anonymous" (UsernameModal.js:52, GameClient.js:116) with no later entry point.
- Impact: leaderboard identity — a core motivator — is unrecoverable without clearing site data; mobile users never even see who they're playing as.
- Recommendation: make "Playing as {username}" a button that reopens UsernameModal (and show it on mobile as an icon/avatar). If skipped, show "Playing as Anonymous — set name".

### H3. Score count-up animates inside an `aria-live` region
- Evidence: the whole result block is `role="status" aria-live="polite"` (RoundResultDialog.js:84) and contains `shownScore` re-rendering ~60fps for 700ms (use-count-up.js:46-53).
- Impact: screen readers either spam partial numbers or coalesce arbitrarily; the announced score may be wrong. Also: newly-opened dialogs often don't announce live-region initial content at all, so the mechanism may be doing nothing for SR users.
- Recommendation: remove `aria-live` from the animating container; add a visually-hidden static sentence rendered once ("You scored 4 points, 130 m away — Good") as the live/status node, or rely on dialog focus + reading order instead.

### H4. 30-minute session expiry has zero UX surface
- Evidence: sessions expire in 30 min (docs/features.md:41); an expired session surfaces only as the generic failed submit → "Round Not Recorded … Nothing was scored" (GameClient.js:174-185, RoundResultDialog.js:70-81). No warning, no countdown, no distinct copy.
- Impact: a player who studies a hard panorama for half an hour gets a confusing failure that reads like a server bug.
- Recommendation: have `/api/guess` distinguish "session expired" from other failures and show tailored copy ("This round expired after 30 minutes — start a fresh one"). Optionally a quiet client-side timer that swaps Submit to "Round expired — New round" after 30 min.

### H5. Guess marker depends on a third-party CDN
- Evidence: marker PNGs hardcoded to cdnjs.cloudflare.com (LeafletMap.js:36-40, duplicated ResultMap.js:30-34).
- Impact: blocked/failed CDN (corporate networks, ad blockers, offline) = the click registers, Submit enables, but the pin is invisible — player can't see or adjust their guess.
- Recommendation: bundle Leaflet marker assets locally (they ship in the `leaflet` package) or reuse the self-contained `divIcon` approach ResultMap already uses (ResultMap.js:48-53). Also DRY: icon setup duplicated across both map components.

---

## MEDIUM

### M1. Game header can overflow at 320-360px
- Evidence: header packs back button + region Badge + 3-button ThemeToggle (108px) + beer button (GameClient.js:248-280); Badge has `whitespace-nowrap` and no max-width/truncate (badge.jsx:8, GameClient.js:262-264). Long district names ("Thị xã Sơn Tây"-length) push the row past narrow viewports.
- Recommendation: `max-w-[40vw] truncate` on the badge; consider collapsing ThemeToggle to a single cycling button on the game screen.

### M2. Unavailable region rows fall below contrast minimums
- Evidence: `opacity-60` on a row whose text is already `text-muted-foreground` (RegionPicker.js:85-89). muted-foreground ≈4.6:1 on white × 0.6 opacity → ~2:1. Same pattern risk: "few streets" chip is 10px muted-on-muted (RegionPicker.js:59-63), ~4.3:1 at tiny size.
- Recommendation: drop the opacity, convey disabled state via the dashed border + explicit label (already present); bump chip to 11-12px or darken its foreground.

### M3. Skip is irreversible, undifferentiated, and adjacent to Submit
- Evidence: Skip permanently discards the round with no confirmation (GameClient.js:208-227), rendered as a same-height outline button beside Submit in the shared bottom bar (GameClient.js:324-331).
- Impact: a mis-tap on mobile (buttons share one row) silently burns the round.
- Recommendation: no dialog needed — but visually demote Skip (ghost, smaller) and/or add a 2-3s "Skipped — undo" affordance is overkill; simplest: widen gap and make Skip `variant="ghost"` so the tap target hierarchy matches consequence.

### M4. ThemeToggle: sub-floor touch targets, emoji glyphs, unmounted flash
- Evidence: buttons are `h-11 w-9` = 36px wide (ThemeToggle.js:57) despite the project's own 44px rule (button.jsx:38-40); emoji ☀️🌙⚙️ (theme.js:11-15) clash with the lucide icon system used everywhere else and render inconsistently across platforms; before mount no option appears selected (ThemeToggle.js:48, 57-58).
- Recommendation: `w-11`; swap emoji for lucide `Sun/Moon/Monitor` (inherit currentColor, fixing the selected-state workaround the comment describes); selected-state flash is acceptable but could read initial theme from the `<html>` class synchronously.

### M5. Browser chrome color ignores the in-app theme choice
- Evidence: `themeColor` uses `prefers-color-scheme` media only (layout.js:29-32); a user forcing dark while OS is light gets a light address bar over a dark app (and vice versa). Same for `colorScheme: "light dark"` at the viewport level vs. per-element override in `applyTheme` (theme.js:71).
- Recommendation: update `<meta name="theme-color">` imperatively inside `applyTheme`.

### M6. Result map red/green marker pair is colorblind-hostile
- Evidence: guess = red dot, actual = green dot, both identical 20px circles (ResultMap.js:48-71); disambiguation only via tap-to-open popups and the 4-decimal coordinate footer (ResultMap.js:117-124).
- Recommendation: differentiate by shape (pin vs. flag / dot vs. star) or add permanent tooltips ("You" / "Actual"); coordinates footer is expert-only noise — replace with plain labels.

### M7. Dialogs lack descriptions; result dialog title not focus-announced context
- Evidence: RoundResultDialog, LeaderboardModal, DonateQRModal render `DialogContent` without `DialogDescription` or `aria-describedby={undefined}` (RoundResultDialog.js:58-66, LeaderboardModal.js:89-94, DonateQRModal.js:11-16) — Radix logs a warning and SR users get title-only context.
- Recommendation: add a short `DialogDescription` each (can be `sr-only`), e.g. result: "Your round score and the actual location".

### M8. Initial load screen has no exit
- Evidence: full-screen spinner with no Back control and no fetch timeout (GameClient.js:233-243, fetch at 63); a hung `/api/new-game` strands the player.
- Recommendation: add "Back to menu" link under the spinner + an `AbortController` timeout (~15s) feeding the C2 error state.

### M9. Desktop search box keeps stale query across rounds (mobile doesn't)
- Evidence: query reset is keyed to minimap collapse (MapSearchBox.js:40-46); desktop `expanded` never toggles, so last round's search text persists into the next round.
- Recommendation: reset on round change (key the panel by session, or pass a `roundKey` prop that clears query).

---

## LOW

- **L1. Invalid Tailwind class**: `focus-visible:-ring-offset-1` (LeaderboardModal.js:113) — negative ring-offset isn't a utility; silently no-op. Intended `ring-offset-1`?
- **L2. Duplicate reduced-motion blocks**: two `@media (prefers-reduced-motion: reduce)` blocks with overlapping `.animate-fade-in-up` rules (globals.css:261-272 and 278-284). Merge.
- **L3. Raw palette bypasses tokens**: score circle bands `bg-green-600/amber-600/…` (RoundResultDialog.js:10-17), leaderboard tier colors (LeaderboardList.js:10-27), hardcoded `#ef4444/#22c55e/#da251d` (ResultMap.js:50,63,76) contradict the stated rule that components reference tokens (globals.css:96-97). White-on-amber-600 digit ≈3.2:1 — passes large-text 3:1 with no margin. Consider a `--score-1…5` token ramp.
- **L4. Naming drift**: `.vn-gradient-bg` is a flat color (globals.css:212-214). Rename `.vn-surface-bg` when convenient.
- **L5. Card titles aren't headings**: "How to Play" / "Where to Play" render via CardTitle (div) under a single h1 (page.js:71, 83, 113) — SR heading navigation skips the page's two main sections. Use `<h2>` via `asChild`/`className` or wrap.
- **L6. Home debug wrench** floats bottom-right for all players (page.js:126-134) — accepted trade-off per project decisions; at 320px it can overlap the last region rows. Consider `bottom-4 right-4` + smaller, or footer placement.
- **L7. No round/streak structure**: each round is standalone; result dialog has no "round N" or session score context (RoundResultDialog.js:62-66). GeoGuessr's 5-round arc is a big retention lever — noted as a product opportunity, not a defect.
- **L8. Donate QR has no text fallback**: image-only payment info (DonateQRModal.js:20-27); a copyable account number line would help desktop users and SR users.
- **L9. Leaderboard type tabs** ("score"/"distance") are jargon-thin; a one-line explainer ("Score = accumulated points · Distance = best single guess") would prevent misreading distance ranks as totals (LeaderboardModal.js:103-125).

---

## What's Working Well (keep)

- Minimap → expand pattern with tap-cover preventing blind pin drops (GuessMapPanel.js:76-86) — genuinely better than many clones.
- Disabled-submit label doubling as instruction: "Place a guess first" (GameClient.js:322).
- Failed-write honesty (RoundResultDialog.js:70-81), leaderboard outage honesty (LeaderboardModal.js:127-133), offline-search fallback row (MapSearchBox.js:184-188).
- Score word labels so color never carries meaning alone (RoundResultDialog.js:20-27); rank number always beside medal (LeaderboardList.js:30-39).
- Safe-area padding on game header/action bar (GameClient.js:248, 314); dvh units throughout.

## Suggested Fix Order

1. C1 (submit spinner) — small state split, biggest per-round payoff.
2. C3 (dialog dismiss trap) — one-line `showCloseButton={false}` + onOpenChange policy.
3. C2 + M8 (error/loading dead ends) — one shared error panel component.
4. H2 (username edit) — small, high goodwill.
5. H5 (bundle marker assets), H3 (aria-live), H1 (keyboard placement — largest effort).
6. Mediums batched as a polish pass.

## Unresolved Questions

1. Is a multi-round game structure (L7) on the roadmap? It changes what the result dialog should be.
2. Should Skip count against anything (leaderboard integrity)? Currently free — affects how prominent it should be (M3).
3. Is Photon the long-term geocoder? If it is, the desktop stale-query fix (M9) should live wherever round identity ends up.
4. Dark map tiles: current "lit window" framing is a documented deliberate choice (GuessMapPanel.js:44-47) — confirm it stays before anyone "fixes" it with a dark tile provider.
