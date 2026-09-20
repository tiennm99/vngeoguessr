# UI/UX review — improvement brainstorm

Date: 2026-09-20 · Scope: home → picker → round → result → leaderboard, plus the audio, region-path-URL and 404 surfaces added since 2026-09-06. Method: source only (no browser on this host). Advisory; no code changed.

Prior audits checked so nothing below repeats an applied fix: `ui-ux-review-260831-1853`, `260901-1624`, `260902-0210`, `260902-0923`, `260906-1522/1659/1751`, `synthesis-260831-1853`.

## 1. What works well

- Loading is split three ways (`GameClient.js:79-81`) and the next round is prefetched with its image while the result dialog is open (`:270-282`). Submit no longer tears the viewer down.
- Failure states stay honest: inline retry panel (`:500-516`), `failed: true` result instead of a fake miss (`:308-321`), leaderboard outage not shown as an empty board (`LeaderboardModal.js:132-138`), non-dismissable result dialog (`RoundResultDialog.js:249`).
- Hint rides in the panorama's flow top bar beside the Mapillary credit (`PanoramaViewer.js:375-404`); one z-index ladder with `isolate` (`globals.css:253-267`); expanded minimap has Escape + focus management (`GuessMapPanel.js:38-50`).
- Tokenised palette incl. semantic result colours (`globals.css:123-139`); 44px floor in `Button`; blue/green marker pair with a named legend (`RoundResultDialog.js:317-334`); scoring copy derived from `SCORE_BANDS` (`page.js:26-37`).
- Per-region titles and both 404s with a way out; audio gated on a gesture, two persisted switches, compact mute on phones, CC0 assets credited.

## 2. Findings

### HIGH

**H1. Game header overflows on phones — controls get clipped once the tally appears.**
Evidence: `GameClient.js:432-491`. Right cluster = ThemeToggle 3×44+border (`ThemeToggle.js:180,193`) ≈134px + compact SoundToggle 46px + icon Beer ≈36px + two `gap-2` = ≈232px. Left: icon Back ≈36px. Centre: region `Badge` (`whitespace-nowrap shrink-0`, `badge.jsx:8`) "Ho Chi Minh" ≈81px, plus after round 1 the tally badge "3 rounds · 7 pts" ≈105px. Header padding 24px. Sum ≈389px without the tally, ≈500px with it. Root is `overflow-hidden` (`:428`), so at 360–414px the right cluster is cut at the viewport edge.
Impact: on most phones the Beer button (and on smaller ones the mute switch) disappears after the first round; the tally, meant as motivation, evicts controls.
Fix: below `sm` render ThemeToggle as one cycling button (or omit it from the game header — theme is set on home); `max-w-[28vw] truncate` on the region badge; render the tally as `3 · 7 pts` with a `title`, or move it into the action bar's free left edge on `lg`. Confirm widths on a 360px device (Q1).

**H2. Core mechanic still pointer-only.**
Evidence: guess placement exists only in `map.on('click')` (`LeafletMap.js:421-439`); no Enter/Space-to-place. Panorama keyboard look-around: PSV's default `keyboard` option is `'fullscreen'`, and `PanoramaViewer.js:310-324` does not set it, so arrow keys do nothing on the desktop viewer unless fullscreen — and the fullscreen navbar is hidden below `lg` (`globals.css:239-243`).
Impact: WCAG 2.1.1 failure on the primary task; unchanged since the first audit.
Fix: when the Leaflet container has focus, Enter/Space drops the pin at map centre with a visible crosshair overlay (Leaflet already pans with arrows via `keyboard: true`); pass `keyboard: 'always'` to PSV and verify it ignores keystrokes inside the search `Input` (Q2).

**H3. A 30-minute expiry still reads as a save failure.**
Evidence: `/api/guess` distinguishes `'Session not found or expired'` (`guess/route.js:26`) and `'Session already submitted or expired'` (`:83`); the client discards `data.error` and sets `{ failed: true }` (`GameClient.js:224-229, 311, 319`); the dialog copy is one generic sentence (`RoundResultDialog.js:277-284`).
Impact: the player who studies a hard panorama for half an hour is told "Your guess could not be saved" — reads like a server bug, blames the app.
Fix: store `reason: 'expired' | 'network' | 'server'` on the failed result (from status 404 vs fetch throw vs 500) and branch the copy: "This round expired after 30 minutes — the next one is ready." Optional: a 30-min client timer that flips Submit to "Round expired — New round".

### MEDIUM

**M1. Primary CTA is below the fold on phones.**
Evidence: `page.js:148-188` renders How to Play (4 steps + 6 scoring rows + note) before Where to Play; on `lg` the grid puts them side by side, below `lg` they stack. Header controls wrap to 2–3 rows (`page.js:104-136`: ThemeToggle 134 + SoundToggle 90 + name chip up to 176 + Leaderboard ≈120 + Beer ≈140 on a 328px row). Estimated ≈700px before the first Play row on a 667px viewport.
Fix: `order-first lg:order-none` on the Where to Play card, or wrap How to Play in `<details>` below `lg`; group Theme+Sound as one row and drop the Beer button to the footer below `sm`.

**M2. The scoring ladder is hidden under a disclosure named for something else.**
Evidence: `RoundResultDialog.js:349-353` summary reads "Leaderboard results"; the ladder chips live inside it (`:358-383`). A 0-point country round shows "Missed" + "Nice try!" with no visible answer to "how close did I need to be?".
Fix: lift the one-row ladder strip above `<details>` (it is ≈32px), keep the board cards inside; or rename the summary "Scoring ladder & leaderboards". Deep-linked players never saw the home-page table, so this is their only explanation.

**M3. Copy still claims per-board scoring ladders.**
Evidence: `GameClient.js:455` title "…leaderboards grade each board on its own scale"; `RoundResultDialog.js:400-403` title "Each board grades your distance on its own scale" plus the comment. `docs/features.md` and commit `b15d199` say the headline and every board agree.
Fix: delete both `title`s; since `entry.points` now equals the headline, render `+N` once or drop it.

**M4. Usernames reject Vietnamese letters.**
Evidence: `UsernameModal.js:395-397` `/^[a-zA-Z0-9_-]+$/`; error says "letters" yet "Tiến" fails. Server only trims (`guess/route.js:89`), so the rule is client-only.
Fix: `/^[\p{L}\p{N}_-]+$/u`, count length in code points, mirror on the server. Note `layout.js:251-259` loads Geist `latin` only, so diacritics would render in the fallback font (prior F20) — pair with a Vietnamese-capable font if accepted.

**M5. Leaderboard dialog is cramped below `sm`.**
Evidence: `LeaderboardModal.js:108-131` is `flex gap-3` with a `min-w-[104px]` type column at every width; `DialogContent` is `max-w-[calc(100%-2rem)] p-6`. At 360px the list gets ≈164px: rank `w-14` + gap + score badge leaves ≈40px for the name.
Fix: `flex-col sm:flex-row`; below `sm` render the type toggle as a horizontal segmented row (same pattern as `RegionSelect`'s level row) above the list.

**M6. Initial load has no exit and no timeout.**
Evidence: full-screen spinner `GameClient.js:415-425` with no Back; `fetchNewRound` (`:42-54`) has no `AbortSignal`; `loadRound` only catches thrown errors, so a hung request spins forever.
Fix: `fetch(url, { signal: AbortSignal.timeout(15_000) })` — the timeout then lands in the existing error panel with Try again / Back; add a "Back to menu" link under the spinner.

**M7. Dialog motion ignores `prefers-reduced-motion`.**
Evidence: `dialog.jsx` overlay/content use `animate-in zoom-in-95 fade-in-0`; the reduced-motion blocks (`globals.css:334-357`) cover accordion, select, fade-in-up and spin only. `GuessMapPanel.js:77` `transition-all duration-200` also unguarded.
Fix: add `[data-slot='dialog-content'], [data-slot='dialog-overlay']` to the `animation: none !important` block; `motion-safe:transition-all` on the panel.

**M8. Music starts on the first tap, behind a modal scrim, with no prior signal.**
Evidence: capture-phase `pointerdown`/`keydown` unlock (`audio.js:270-280`); `MusicPlayer` starts on unlock (`:294-302`); on landing the first gesture is inside `UsernameModal` (`page.js:51-55`) while the only mute control sits behind the scrim (`:110`). `keydown` also means a keyboard user pressing Tab starts music.
Default-on is a recorded decision; options rather than a reversal: (a) start music on the Play click or when the welcome modal closes, not on the first pointerdown; (b) one-line "Music is on · Mute" link in the welcome modal footer; (c) unlock on `keydown` only for Enter/Space.

### LOW

- **L1** Result-map coordinate footer (`ResultMap.js:619-626`) is expert noise; the legend already names both dots. Drop or replace with "Guess → Actual".
- **L2** `focus-visible:-ring-offset-1` is not a utility (`LeaderboardModal.js:118`); still a no-op since 08-31.
- **L3** "score" / "distance" type buttons (`LeaderboardModal.js:112-127`) need a one-line explainer (total points vs best single guess).
- **L4** Minimap cover still lacks `aria-expanded` (`GuessMapPanel.js:141-150`).
- **L5** `themeColor` follows the OS only (`layout.js:273-276`); set `<meta name="theme-color">` inside `applyTheme` so a forced-dark user does not get a light address bar.
- **L6** `RegionPicker.js:118-119` docblock says the province row plays; in code the trigger expands and Play is inside content (`:173-174`), so a province is two taps. Fix the comment; consider a Play pill beside the chevron as a sibling (not nested) control.
- **L7** First effect has decode latency: `playSound` awaits fetch+decode, so the `click` on Play (`page.js:92`) lands after navigation starts. Warm `click`/`pin`/`submit` on unlock — that is a gesture, so the "nothing fetched before a gesture" rule holds.
- **L8** Music stop/start is abrupt (`MusicPlayer.js:257-262, 283`); a 300ms gain ramp reads as intentional.
- **L9** Skip is still a same-weight outline beside Submit (`GameClient.js:575-584`); `variant="ghost"` + wider gap matches consequence.
- **L10** The initial path never sets `roundLoading` (`GameClient.js:168-189`), so between spinner-off and texture-ready the pane shows PSV's unthemed "Loading…" text. Set it true there, or style `.psv-loader` with tokens.

## 3. Forward-looking ideas

| # | Idea | Effort | Why |
|---|---|---|---|
| 1 | **Region-hit feedback** on province/country rounds: server already resolves the panorama's district; resolve the guess with the same outlines and add "Right province, wrong district" under the score. Ladder untouched. | M | Gives Vietnam rounds a gradient without reopening the one-ladder decision |
| 2 | **Progressive texture**: load `thumb_1024_url` first, `viewer.setPanorama(thumb_2048)` when ready | M | Halves time-to-first-look on mobile data |
| 3 | **5-round set + summary** (rounds, points, best distance) seeded from the existing tally | M | Still the strongest open retention lever from the synthesis |
| 4 | **Share line**: copy "VNGeoGuessr · District 7 · 4/5 · 87 m · /game/tphcm-q7" from the result dialog | S | Region path URLs make results deep-linkable for free |
| 5 | **Self-rank row**: `ZREVRANK` for `currentUsername`, pinned "You · #143" under the list when off-screen | S | Top-200 boards hide most players from themselves |
| 6 | **Picker search**: reuse `searchRegions` from `lib/geo-search` above the accordion | S | 85 regions; alias-aware matcher already exists |
| 7 | **Haptic on pin drop**: `navigator.vibrate(10)` beside the `pin` sound, gated by the SFX pref | S | Confirms the tap when the phone is muted |
| 8 | **Daily challenge** (date-seeded 5-panorama set, daily board) | L | Synthesis H1; unchanged reasoning |

## 4. Top 3

1. **H1** — a phone header that clips its own controls after round one is the most visible regression on the most common device; one breakpoint change.
2. **M1 + M2 bundle** — get the Play row above the fold and the ladder out from under "Leaderboard results"; together they fix first-session comprehension for both home and deep-link arrivals. Do **M3** in the same pass (copy contradicts the shipped scoring).
3. **H3 + M6** — carry the server's reason into the failed result and give the first fetch a timeout; small change, removes the two remaining "the app looks broken" moments.

## 5. Unresolved questions (need a real device or browser)

1. Exact header overflow thresholds at 360/375/390/414px with and without the tally badge (H1 math is from class widths, not measurement).
2. Does PSV `keyboard: 'always'` swallow arrow keys typed in `MapSearchBox`? Decides the shape of the H2 fix.
3. On iOS Safari, does music start on the first tap inside the welcome modal, and is the mute control discoverable at that moment? (M8)
4. Whether tw-animate's `animate-in` respects reduced motion on its own; M7 assumes it does not.
5. Leaderboard list legibility at 320px with 20-char names (M5).
6. If M4 is accepted: how Geist's latin-only subset renders Vietnamese names in chips, the result dialog and the leaderboard.

---

Status: DONE
Summary: Read-only UI/UX audit of VNGeoGuessr; 3 high, 8 medium, 10 low findings with file:line evidence and fixes, 8 forward ideas, top-3 sequence. Report written to the requested path.
Concerns/Blockers: none — all width/overflow figures are derived from classes and need one device pass to confirm.
