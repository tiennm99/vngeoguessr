# Frontend review (2026-09-29, `dev` @ cca6018)

Read-only review of the client side after the 2026-09-21 whole-project review
and its Resolution. Items in that Resolution are not re-reported unless the fix
is incomplete or introduced a new defect.

## Scope

- `src/app/{page,layout,not-found,game/*,daily,debug/*}.js`, `globals.css`
- every file in `src/app/components/` (27 files, 3,477 lines) and `src/components/ui/`
- the client libs: storage, use-stored-value, regions, theme, audio, share,
  geo-search, map-tiles, username, last-region, first-round-hint,
  daily-progress, daily-calendar, use-count-up, utils (`player-id.js` is
  server-side and was checked only for client imports; there are none)
- Gates: `npm run lint` 0 problems; `npm test` 33 files / 409 tests pass;
  `npm run build:check` green (101 static pages).
- Not checked at runtime: no browser on this host. Every finding below comes
  from tracing source. Leaflet behaviour was checked against the Leaflet 1.9.4
  source; Next 16 `Image` behaviour against nextjs.org (the bundled docs are
  hook-blocked).

## Overall

The round-transition machinery (epoch refs, watchdog, prefetch, derived daily
replay) holds up: I found no stale-epoch path that applies a superseded round.
Client safety holds too. No client chunk in `.next-check/static/chunks`
contains a server env name, the Neon driver or pano-index code. `/api/new-game`
and `/api/daily` send the image URL (an accepted risk), `sessionId`, and the
picked region, never the resolved district.

The defects are elsewhere. The warning text added by the Bug 1 fix cannot be
seen. The game cannot be played with a keyboard. The dialog role added to the
expanded map misdescribes the page to screen readers. The client shows raw
parser errors to players. And the previous review's bundle claim is wrong.

## High

### H1. The "partial" warning is invisible in both themes, and missing when every board fails. CONFIRMED
`src/app/components/RoundResultDialog.js:340-344` renders the line as
`text-warning-foreground` on `DialogContent`, which is `bg-background`
(`src/components/ui/dialog.jsx:60`). That token is meant as the text colour
on top of a `bg-warning` fill: it is `#ffffff` in light and `oklch(0.145 0 0)`
in dark (`globals.css:132,202`), the same colour as `--background` in each
theme. Measured contrast is 1.00:1 in both.
The line also sits inside `hasLeaderboardSection && <details>` (`:261`), which is
collapsed by default. If every score credit fails, `leaderboard.js:177-190`
returns `levels: []`, `partial: true`, so `hasScoreLevels` is false. If the
distance ranks also have no rank, the section and the warning are never
rendered at all.
**Scenario:** a Redis blip after the session claim. The player sees the normal
success reveal, and the only qualifying sentence is either not rendered or
drawn white on white.
**Fix:** move the sentence out of `<details>` and render it whenever
`result.partial` is true, under the distance badge. Use `text-foreground` with
an `AlertTriangle` icon, or a `bg-warning text-warning-foreground` pill. Plain
`text-warning` only reaches 3.7:1 in light.

### H2. There is no keyboard path to place a guess. CONFIRMED
`LeafletMap.js:87` places the pin only on Leaflet `click`. In Leaflet 1.9.4,
`Map._fireDOMEvent` attaches `latlng` only to mouse events, and the
keyboard handler only pans and zooms. `MapSearchBox.js:15-16` says in its
header comment that a search result never places the pin.
**Scenario:** a keyboard-only or switch user can tab to the map, pan it and
zoom it, but can never place a guess. Submit stays disabled
(`GameClient.js:584`) and the round cannot be played (WCAG 2.1.1).
**Fix (minimal):** in `LeafletMap`, add a `keydown` listener on
`map.getContainer()` that calls `emitMapClick(map.getCenter())` on Enter or
Space while the container itself has focus. Add a centre crosshair and an sr-only
hint ("Press Enter to guess at the map centre"). A search result can then be
refined into a guess this way too.

## Medium

### M1. The expanded map declares `aria-modal` without being a modal. CONFIRMED
`GuessMapPanel.js:89-91` sets `role="dialog" aria-modal="true"` whenever
`expanded` is true. Two things are wrong:
- No focus trap, and the next required control, Submit, lives outside the
  panel (`GameClient.js:581-611`) while staying visible. VoiceOver honours
  `aria-modal` and hides that action bar from swipe navigation.
- `expanded` is not tied to the breakpoint. Expand on an iPad in portrait, then
  rotate to landscape (768 to 1024px, crossing `lg`). The panel becomes the desktop
  grid cell but keeps `role=dialog`, `aria-modal`, and the Escape listener
  (`:43-56`). The only visible way to collapse it, the collapse button, is
  `lg:hidden` (`:172`).
**Fix:** drop `aria-modal` and keep a non-modal `role="dialog"` or `region`
with a label. Alternatively, collapse on a `matchMedia('(min-width: 1024px)')`
change in GameClient, and gate `role` on that same query.

### M2. Parser errors reach the player as the error message. CONFIRMED
`GameClient.js:67` calls `await response.json()` outside the `try` that maps
network errors. A non-JSON response (a Vercel `FUNCTION_INVOCATION_TIMEOUT` or
504 page, a Neon cold start past the function limit) throws a `SyntaxError`.
`loadRound` then puts `error.message` into `loadError`, and `:521` renders it
verbatim: "Unexpected token 'A', "An error o"... is not valid JSON".
**Fix:** wrap the parse:
`let data; try { data = await response.json(); } catch { throw new Error('The server could not start a round. Please try again.'); }`.
`LeaderboardModal.js:45` has the same parse, but its message goes to the console,
so it only needs the same guard for tidiness.

### M3. Muted text on `vn-surface` fails AA, which the repo itself measured. CONFIRMED
`NotFoundPanel.js:25-30` records `text-muted-foreground` on `.vn-surface` at
4.05:1 on average and 3.09:1 at worst in light, and switches that panel to
`text-foreground`. The same pairing is still used on the same surface elsewhere:
- `page.js:145`: hero subtitle.
- `page.js:201`: attribution line. `text-xs` at `/80` opacity, so lower still,
  and it carries the Mapillary/OSM credits the licences require to be legible.
- `GameClient.js:490`: region name on the first-load screen.

**Fix:** use `text-foreground` (or `/80`) at these three sites, or put them on
a `bg-card` chip.

### M4. Leaderboard distance colours fail AA in light theme. CONFIRMED (computed)
`LeaderboardList.js:11-16,98-100` sets `text-warning`, `text-success` or
`text-danger` on a `secondary` badge (`oklch(0.97)`). The ratios are 3.70, 4.16
and 4.37:1 at 18px bold, which is below the 18.66px large-text threshold, so
4.5:1 applies. Dark theme passes (7.99:1 for warning).
**Fix:** darker light-theme text variants (e.g. `oklch(0.45 …)`), or keep the
number `text-foreground` and carry the grade in a small coloured dot.

### M5. An old prefetch can hand the player a round that expires early. PLAUSIBLE
`startPrefetch` (`GameClient.js:324-336`) mints the next session as soon as the
result dialog opens. `handleNextRound` (`:420-428`) uses it no matter how long
the dialog was left open. Session TTL is 30 minutes from mint.
**Scenario:** the player leaves the result open for 25 minutes, presses Next
Round, and plays for 6 minutes. The guess returns `session-expired`, and the
dialog says "Rounds last 30 minutes" (`RoundResultDialog.js:18-21`) after 6.
**Fix:** store `{ promise, at: Date.now() }` and ignore a prefetch older than
about 20 minutes, falling through to `loadRound`.

## Low

- **L1. The count-up shows the old final score for one frame. CONFIRMED.**
  `use-count-up.js:27,48`: `frame` survives dialog close because
  `RoundResultDialog` stays mounted. When the next round has the same score,
  the first open render returns `frame.shown === value`, then the first interval
  tick drops to 0 and counts up again ("3, 0, 1, 2, 3"). Reset during render when
  `!active && frame.target !== null`, or key the frame by an open counter.
- **L2. ResultMap timers outlive the map. CONFIRMED (Leaflet source).**
  `ResultMap.js:96-97` schedules `invalidateSize` at 100 and 500ms without
  clearing them. `Map.remove()` never resets `_loaded` and deletes
  `_mapPane`. Next Round or Menu within about 800ms of the dialog opening
  therefore runs `_rawPanBy` on an undefined pane, an uncaught `TypeError`
  (console or monitoring noise). Keep the ids and clear them in the cleanup.
- **L3. Escape in the search box also collapses the map. CONFIRMED.**
  `MapSearchBox.js:92-95` closes the list without stopping propagation, and
  the window listener at `GuessMapPanel.js:46-53` collapses the map on the same
  keypress. That is exactly the "one keypress, two things" the comment there
  guards against for dialogs. Call `event.stopPropagation()` in the search
  handler.
- **L4. The region tree is still in the `/game` first-load chunk. CONFIRMED (build output).**
  The Resolution's item 8 says making `MapSearchBox` dynamic took the region
  tree off `/game/*`. It did not: `GameClient.js:19` and `RoundResultDialog.js:9`
  import `regions.js` statically. The tree (~47-53 KB raw) is in chunk
  `1m-8rm8olxirm.js`, which the client manifests of `/game/[region]` and
  `/daily` list. It is small, so the real fix is optional: have
  `game/[region]/page.js` pass `{ code, name, center, bbox, slug }` as props.
  At minimum, correct the claim.
- **L5. `memo(PanoramaViewer)` never skips a render.** `GameClient.js:538`
  passes a fresh `<FirstRoundHint …/>` element each render, so every pin move and
  every state change re-renders the viewer (`PanoramaViewer.js:146`). The effect
  does not re-run, so this is only wasted work. Pass `hasGuess` down, or
  `useMemo` the slot.
- **L6. `panorama-error` never reaches `onError`.** `PanoramaViewer.js:67-71`
  calls only `emitReady`, so `handlePanoramaError` (`GameClient.js:297-302`)
  runs only for a constructor throw. An image that fails to load, such as an
  expired CDN URL, plays no error sound and gives no signal. Call
  `emitError(event)` there too.
- **L7. Daily replay loads the full viewer behind a dialog that cannot be
  dismissed.** `GameClient.js:138,532-539`: reopening `/daily` after playing
  downloads the three.js chunk (638 KB raw), the panorama and the guess map, only
  to sit under a `bg-black/50` scrim. The stored `imageUrl` may also have
  expired by then (PLAUSIBLE). Render a static backdrop when `replay` is set.
- **L8. `audio.js` bypasses `storage.js`. CONFIRMED.** Lines 54-79 read and
  write `localStorage` directly. `docs/development.md` ("all reading through
  `src/lib/storage.js`") and `storage.js`'s own header, which lists "sound",
  both say otherwise. As a result, muting in one tab never reaches another tab
  (no `storage` event), and the in-memory fallback is written twice. Move the
  flags onto `readItem`/`writeItem`/`watchItem` and keep the in-memory cache.
- **L9. `Image priority` is deprecated in Next 16.** `AppBackground.js:22`.
  nextjs.org (v16.0.0 changelog) replaces it with `preload`. The image also
  preloads on `/game`, where opaque panes cover it and it competes with the
  panorama download. Use `fetchPriority="high"` and consider skipping it on
  `/game`.
- **L10. `AbortSignal.any` needs Safari 17.4.** `geo-search.js:159`. On
  iOS 16.4-17.3 the call throws inside the `try` and returns `null`, so Photon
  search always shows "unavailable". It degrades gracefully, but it is silent.
  Feature-detect and fall back to the caller's signal plus a manual timer.
- **L11. Type-button touch targets.** `RegionSelect.js:100` level buttons are
  `h-9` (36px) in the home page's leaderboard dialog, where everything else
  honours the 44px floor.
- **L12. The theme re-apply in `game/[region]/not-found.js:31-35` looks redundant. PLAUSIBLE.**
  `ThemeSync` (added in 30cfe63) mounts in the root layout. The file's own
  comment says the error shell renders that layout on the client, so ThemeSync
  already applies the theme and watches the OS. If so, the file can drop
  `"use client"`. Confirm with a dark-theme visit to `/game/nope`.
- **L13. `CoverageMap.js:38-40`: the one `react-hooks/refs` disable is avoidable.**
  An effect event can read `panos` from props when Leaflet calls it
  (`const nearest = useEffectEvent((latlng) => …panos…)`). The claim that
  "data, not a callback, so an effect event does not fit" does not hold.
  Debug-only.
- Dead code: the `try/catch` around a non-awaited `fetch` in `handleSkipGuess`
  (`GameClient.js:454-464`) cannot catch anything, and `handleRetryLoad` is a
  bare alias (`:475`).

## Scout: edge cases checked and found sound

- A viewer `ready` arriving late from the outgoing round is filtered by
  `appliedEpochRef` (`GameClient.js:204,293`).
- A load released by the watchdog cannot inherit a pin (`:200`).
- The daily first-load effect reads storage, not the hydration snapshot
  (`:247`).
- A replay cleared in another tab restarts the load through the `replay`
  dependency.
- The `getDailyProgress` parse cache keeps `useSyncExternalStore` from looping.
- `LeafletMap` dependencies (`center`, `bbox`) are stable references into the
  generated tree, including `VN` for the daily, so the map is not rebuilt per
  render.
- Every Radix dialog has a Title and Description. `RoundResultDialog`
  announces the outcome once through its description.
- Reduced motion covers spin, fade-in, dialog and accordion, and the count-up
  checks the preference.
- Hydration: every storage-backed value goes through `useStoredValue` with a
  server value. `DailyCard` reads the day the same way. `InlineScript` is
  covered by `suppressHydrationWarning`.
- Listeners: every `watch*` returns an unsubscribe that is used. Leaflet (guess
  and result) and PSV destroy on unmount. The one gap is L2.

## Recommended order

1. H1 (one component, and it finishes the Bug 1 fix).
2. H2 (keyboard guess).
3. M2 (JSON guard).
4. M1 (drop `aria-modal`, collapse at `lg`).
5. M3 and M4 (contrast tokens).
6. M5, then the Low items as convenient. Correct the L4 claim in the
   2026-09-21 synthesis.

## Metrics

- Tests: 409 pass. None render a component, so every finding above is runtime
  or visual and outside what the gates can see.

## Unresolved questions

- H2: is a centre-crosshair keyboard guess acceptable UX, or should a keyboard
  guess go through the search result plus a "guess here" action?
- M1: should the phone minimap stay a modal? If yes, the action bar has to move
  inside it.
- L7: is the replay's panorama behind the dialog a deliberate backdrop?
