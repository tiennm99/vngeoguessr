# UI/UX Research: Geography Guessing Game Patterns (2024-2026)

Scope: GeoGuessr + clones (GeoHub, WorldGuessr, Enigjewo, OpenGuessr), Worldle-style
games, map/panorama libraries (Leaflet, Photo Sphere Viewer), and accessibility/mobile
guidance from NN/g and library docs. Grounded against this repo's current
implementation (`GuessMapPanel.js`, `PanoramaViewer.js`, `RoundResultDialog.js`,
`ResultMap.js`, `LeaderboardList.js`) to flag what's already aligned vs. what's a gap.

Source quality note: GeoGuessr has no official UX documentation; findings on it come
from community userscripts/extensions, Hacker News threads, and clone READMEs
(secondary, but consistent across many independent authors = corroborated pattern,
not single-source). Library docs (Leaflet, Photo Sphere Viewer) and NN/g are primary/
authoritative. Retention-loop claims (Duolingo, Snapchat stats) are widely cited but
originate from company blog posts, not independent audits — treat magnitudes as
directional, not exact.

---

## 1. Guess-map interaction (corner widget vs. split view)

**Pattern across GeoGuessr and every clone surveyed** (GeoHub, WorldGuessr,
Enigjewo, community userscripts): desktop uses a **split view** — large panorama
dominant, a persistent map panel (either a fixed side panel or a bottom-left corner
overlay) always visible and always clickable, with a distance "Guess" confirm button
that only enables once a pin is placed. Mobile cannot fit both full-size, so the map
becomes a **collapsed corner thumbnail that expands to fullscreen on tap** — this is
GeoGuessr's own mobile-app pattern (an "enlarge map" button was added after years of
user complaints, and third-party userscripts existed for years specifically to fix
GeoGuessr's own tiny fixed-size guess map before the vendor did it natively). NN/g's
mobile-maps research explains the mechanism: **maps and touch-scroll gestures compete
for the same swipe input** ("swipe ambiguity" — users starting a scroll gesture on
the lower half of the screen accidentally pan the map instead), which is exactly why
collapsing the map to a small non-interactive-looking preview until explicitly
expanded is the correct mobile default, not just a screen-space compromise.

**This repo already implements the corner-widget-to-fullscreen pattern correctly**:
`GuessMapPanel.js` renders a 144px corner thumbnail on mobile with a full-tile
tap-to-expand overlay button ("Tap to guess" / "Edit guess"), expanding to
`inset-x-3 top-3` fullscreen, and calls `map.invalidateSize()` after the CSS
transition to fix Leaflet's stale-container-size bug. Desktop already gets a
persistent flex-1 side panel via the `lg:` breakpoint. This matches the dominant
industry pattern, not a divergent one.

**Recommendations:**
1. Keep the current corner-thumbnail → fullscreen-tap pattern; it matches both
   GeoGuessr's shipped mobile behavior and NN/g's swipe-ambiguity guidance. No
   change needed here.
2. Consider adding a lightweight "pin placed" visual confirmation *on the collapsed
   thumbnail itself* (small dot) even when collapsed, so a mobile player who
   guessed then collapsed the map isn't left wondering if the guess registered —
   several clone READMEs and the userscript history suggest this was a recurring
   complaint pattern ("did my guess register").
3. Keep the confirm/submit button reachable without requiring the map to be
   expanded (already true here per `hasGuess` prop threading) — this is the
   detail most clones get wrong (forcing map-open to submit).

---

## 2. Round result / reveal UX

Common pattern across GeoGuessr, GeoHub, and community extensions ("Smart Zoom",
"Better Scoreboard" scripts): reveal screen shows, in order, (a) the score number
counting/animating up rather than appearing static, (b) a dashed line from guess pin
to actual location on a small reveal map, (c) distance text, (d) a persistent
"Play again / Next round" CTA sized larger than secondary actions (menu/quit).
Retention-loop research (Duolingo, casual-game design writeups) converges on: fast
loop restart with minimal friction, and a visible progress signal (streak or rank
delta) is what drives repeat sessions — the reward doesn't need to be large, it
needs to appear reliably and immediately after the action that earned it.

**This repo already implements the core of this pattern well**: `RoundResultDialog.js`
uses `useCountUp` for the score, staggered `animate-fade-in-up` reveals (120ms/240ms/
320ms delays) for score → distance → message, a `role="status" aria-live="polite"`
wrapper so screen readers announce the result, and `ResultMap.js` draws a dashed
red polyline (`dashArray: '8 4'`) between guess and actual pins with `fitBounds` to
frame both. "Next Round" is the primary (flex-[2]) button, "Menu" is secondary
(flex-1, ghost variant) — correct visual hierarchy.

**Gaps relative to the pattern:**
- No streak/session counter visible anywhere in the reveal (rank vs. leaderboard is
  shown, but no "N rounds played this session" or similar lightweight momentum
  signal) — this repo has no accounts, so cross-session streaks aren't feasible, but
  an in-session round counter costs nothing and is the retention primitive that
  survives a no-login constraint.
- The distance line animates in as already-drawn (Leaflet polyline appears instantly
  with the map), rather than drawing progressively — GeoGuessr's native reveal
  animates the line growing from pin to pin, which reads as more deliberate/dramatic.
  This is a nice-to-have, not a gap that blocks a good experience.

**Recommendations:**
1. Add a simple in-session round counter (e.g., "Round 4" or "4 played today," reset
   on tab close) near the score reveal — the no-accounts constraint rules out
   persistent streaks, but session momentum is the cheapest retention lever left.
2. Keep the count-up + staggered fade-in pattern as-is; it already matches the
   observed convention and needs no rework.
3. Optional polish only if time allows: animate the polyline drawing (e.g., via a
   short requestAnimationFrame interpolation of the line's endpoint) instead of
   rendering it instantly — low priority, cosmetic only.
4. Keep the `result.failed` distinct-state handling (never present a save failure as
   a zero-point miss) — this is a correctness/trust issue that generic reveal-UX
   research doesn't cover but matters more than any animation polish.

---

## 3. Panorama viewer UX

Photo Sphere Viewer's own docs and configuration guide establish the baseline
controls: drag/pinch to look around, a `panControl`/compass affordance, a
`zoomControl` near bottom-right, configurable `minFov`/`maxFov` for zoom limits, and
a navbar that can be reduced to just the controls a given game needs (PSV supports
`navbar: ['zoom', 'fullscreen']` etc.). For street-view-style games specifically, the
recurring UX requirements across GeoGuessr and clones are: (a) one-finger drag must
rotate the view on mobile — two-finger-only rotation is wrong for a viewer that is
the primary game surface, not an inline scrolling-page embed, (b) a graceful fallback
when a panorama fails to decode/load (flat image or retry, never an infinite
spinner), and (c) preserving viewport orientation across round transitions so the
player isn't reoriented every round.

**This repo already implements items (a)-(c) directly**: `PanoramaViewer.js` sets
`touchmoveTwoFingers: false` specifically because "looking around is the core verb of
the game" (matches point a); it has an explicit `panorama-error` handler that calls
`showFallbackImage()` and still fires `onReadyRef.current?.()` so the loading state
resolves instead of hanging (matches point b); `navbar: ['zoom', 'fullscreen']` is a
deliberately reduced control set rather than PSV's full default navbar.

**Gaps relative to the pattern:**
- No compass/heading indicator is configured (navbar omits any pan/compass control)
  — for a geography guessing game, knowing compass orientation is sometimes part of
  the puzzle-solving toolkit players expect (shadow direction, sun position reasoning
  benefits from knowing which way is north). This is a judgment call: GeoGuessr's own
  competitive community actually disables the compass in "no-move, no-pan, no-zoom"
  ranked modes because it's considered a mild assist — so omitting it isn't a UX
  miss, it may be an intentional difficulty choice already made correctly for a
  casual/no-accounts context. Flagging as a decision to confirm, not a bug.
- No explicit loading-state UI is visible in the reviewed component beyond PSV's
  default (`loadingImg: null` disables PSV's built-in loader entirely) — the fallback
  path is handled, but the *slow-network-not-yet-errored* state (Mapillary imagery
  can be slow) has no visible spinner/skeleton before `ready` fires, unlike the
  `GuessMapPanel`'s explicit `Loading map...` status region.

**Recommendations:**
1. Confirm whether omitting a compass control is an intentional difficulty choice
   (matches competitive GeoGuessr's "no-compass" mode norms) or an oversight — if
   the game wants to stay approachable/casual rather than competitive, adding a
   small always-visible compass affordance is the more player-friendly default.
2. Add a visible loading indicator (skeleton or spinner) for the pre-`ready` window
   since `loadingImg: null` removes PSV's own — this closes the one loading-state gap
   relative to the rest of the app, which already treats loading states carefully
   (map panel, dialogs).
3. Keep `touchmoveTwoFingers: false` and the `panorama-error` fallback exactly as
   implemented; both match the dominant, validated pattern.

---

## 4. Leaderboard / competitive UX without accounts

NN/g's leaderboard literature (via IxDF/leaderboard pattern references) and hyper-
casual game UX guides converge on: leaderboards work best when **contextual**
(comparing to nearby-skill or nearby-in-time players, not a global all-time list
dominated by early adopters), and the current player's own row should always be
visible/highlighted even when off-screen from the top. For anonymous, no-account
casual games, the standard substitute for persistent identity is a **self-chosen
display name stored client-side** (localStorage/cookie) that's echoed back into the
scoreboard rather than a login — the game doesn't need auth, it needs the *same
device* to recognize "you" on return visits.

**This repo already implements the core of this pattern**: `LeaderboardList.js`
does exact `entry.username === currentUsername` matching, applies a distinct
amber-highlighted row + a "YOU" badge, and top-3 get medal icons + rank number
together (rank number always shown alongside the medal, "colour alone must not
carry the result" per the code comment) — this independently satisfies the
color-contrast/colorblind-accessibility concern that leaderboard UX guides raise.
Two leaderboard types exist (score-based and distance-based, i.e., "best single
round" style), which maps to the contextual-leaderboard idea of giving players more
than one axis to compete on rather than a single global list.

**Gaps relative to the pattern:**
- No visible "your best rank" indicator when the player isn't in the visible page of
  results (e.g., rank 4000 of 10000) — the reviewed component doesn't show pagination/
  scroll-to-user behavior in what was read, though it may exist in the parent
  (`LeaderboardModal.js`, not reviewed in depth here).
- Username collision handling wasn't reviewed — with no accounts, two players could
  pick the same name and the "YOU" highlight would falsely mark both/neither. Worth
  a quick check in `src/lib/username.js`/session handling if not already addressed.

**Recommendations:**
1. Verify (or add) a "jump to my rank" affordance in `LeaderboardModal.js` for
   players ranked far down the list — contextual self-visibility is the single
   highest-value leaderboard feature per the sources above, and current-username
   highlighting alone doesn't help if the row is off-screen.
2. Confirm session/username collision handling is scoped per-session (cookie/session
   id, not raw username string) so the "YOU" highlight can't mismatch two different
   players who picked the same display name — check `src/lib/session.js` and
   `src/lib/username.js`.
3. Keep the medal-plus-rank-number (never color-only) pattern and the dual score/
   distance leaderboard axes; both are already correct per the sources.

---

## 5. Mobile-first patterns for dual-canvas (panorama + map) games

This is the hardest layout problem in the whole genre and the one most heavily
documented via complaint threads (GeoGuessr's multi-year "map too small" issue).
The converged pattern: **panorama is always the dominant/full-bleed layer; the map is
always an overlay, never a permanent split, on small viewports.** NN/g's mobile-map
guidance generalizes this: on small screens, prefer showing one primary interactive
surface with the second surface as an on-demand overlay rather than splitting the
viewport, because a split-screen map on mobile is usually too small to be usable for
precise interaction (pins too close together for fat-finger accuracy) and steals
scroll/pan gesture space from whichever surface is on the bottom half.

**This repo already implements this correctly** — full-bleed panorama with corner
overlay expanding to fullscreen tap-target on mobile (`GuessMapPanel.js`, see §1),
and `PanoramaViewer` sets `touch-none` on its container so it doesn't fight page
scroll (the game screen itself doesn't scroll, sidestepping NN/g's swipe-ambiguity
issue entirely by design, per the code comment on `touchmoveTwoFingers`).

**Recommendations:**
1. No architectural change needed — the current approach (full-bleed panorama,
   overlay map, explicit expand state controlled by parent for reset-on-new-round)
   already matches the validated pattern across the genre.
2. Double-check the `safe-area-inset-bottom` handling (already present in the
   `bottom-[calc(5.25rem+env(safe-area-inset-bottom))]` class) against notched/
   gesture-nav Android devices in addition to iOS, since `env(safe-area-inset-*)` is
   iOS-authored but Android WebView support varies by OS version.
3. When expanded, verify the fullscreen map still leaves the collapse/minimize
   button reachable one-handed (bottom third of screen) on large phones — a common
   mobile-map complaint is controls placed at the top of a fullscreen map being out
   of thumb reach; current code places it at `top-2 right-2`, which is a candidate
   to revisit if user feedback flags reachability.

---

## 6. Accessibility patterns for map-based interaction

Leaflet's own accessibility guide (authoritative, first-party) and the Leaflet/
react-leaflet GitHub accessibility discussions are the primary sources here:
Leaflet ships keyboard-operable map containers and markers by default (Tab moves
focus, Enter/Space activates) — the responsibility for a consuming app is to *not
break* these defaults, label every marker with a descriptive `alt`/`title` (not just
an icon), test with a real screen reader (NVDA/Narrator/VoiceOver/Orca), and use
`inert` on purely decorative maps. `react-leaflet` has an open, still-unresolved
GitHub issue (#1009) asking for first-class ARIA-role support on the `<MapContainer>`
— meaning teams generally still hand-add ARIA attributes themselves rather than
getting them for free.

**This repo already does some of this correctly**: the `GuessMapPanel` loading
state uses `role="status" aria-live="polite"`, expand/collapse buttons have
`aria-label`, and icon-only buttons pair `aria-hidden="true"` icons with visible
text or `aria-label`. This is better than the median implementation the sources
describe (most consuming apps skip this entirely, per the GitHub discussion).

**Gaps relative to the pattern:**
- The guess-placement pin itself (dropped by clicking/tapping the map, per
  `onMapClick` in `GuessMapPanel`) has no reviewed keyboard-only path — Leaflet's
  own guide notes map containers are keyboard-operable by default but *placing a
  pin via keyboard* (as opposed to panning/zooming) isn't something Leaflet gives
  for free; it requires an app-level keyboard handler (e.g., Enter/Space on a
  focused map center, or a dedicated "confirm guess here" affordance) that wasn't
  found in the reviewed files.
- `ResultMap.js`'s guess/actual markers use `bindPopup` text ("Your Guess"/"Actual
  Location") which is good, but the divIcon markers are raw colored `<div>`s with no
  `alt`/`title`/`aria-label` on the marker itself — a screen-reader user tabbing to
  the marker (rather than opening its popup) may get no announcement.

**Recommendations:**
1. Add a non-mouse way to place/confirm a guess (at minimum, a "confirm guess at map
   center" keyboard-reachable button when the guess map is focused) — this is the
   single actual accessibility gap found, since the whole core game action (placing
   a pin) currently assumes pointer/touch input.
2. Add `alt`/`title`/`aria-label` to the `ResultMap.js` divIcon markers, not just
   their popups, matching Leaflet's own guidance ("markers require unique,
   descriptive labels").
3. Test the guess-map and reveal-map flows with a screen reader (NVDA on Windows is
   free and matches the dev environment) — Leaflet's guide explicitly recommends
   this over inferring compliance from markup alone, since plugin behavior
   (react-leaflet, custom overlays) can silently break the library's keyboard
   defaults.

---

## Limitations

- GeoGuessr's actual native UX is not documented by the vendor; all claims about it
  come from third-party scripts/extensions and community threads, which are
  consistent but not an authoritative spec — treat as "converged community
  consensus," not ground truth from GeoGuessr Inc.
- Did not evaluate performance/bandwidth aspects of panorama loading (image
  compression, progressive loading strategies) — flagged as tangential to *UX*
  patterns proper, but likely worth a separate pass given "Mapillary imagery can be
  slow" is noted in this same report.
- Did not review `LeaderboardModal.js`, `GameClient.js` in full, `session.js`, or
  `username.js` — leaderboard-scroll-to-self and username-collision recommendations
  in §4 are therefore flagged as "verify," not confirmed gaps.
- Retention-loop statistics (Duolingo 12%→55%, Snapchat 30-40 opens/day) are sourced
  from secondary aggregator articles citing company PR, not independently audited —
  used only directionally to support "session momentum indicators matter," not as
  precise benchmarks for this app.

## Unresolved questions
1. Is the panorama viewer's lack of a compass control an intentional difficulty
   choice, or should one be added for a casual (non-competitive) audience?
2. Does `LeaderboardModal.js` already scroll-to/highlight the current player when
   off-screen in a long leaderboard? (Not reviewed.)
3. Is username uniqueness enforced per-session/per-cookie, or by raw string match,
   in `src/lib/username.js` / `src/lib/session.js`? (Not reviewed — affects whether
   the "YOU" leaderboard highlight can misfire.)
