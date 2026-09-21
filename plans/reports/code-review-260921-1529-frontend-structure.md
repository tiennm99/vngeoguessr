# Front-end structure review — branch `dev`

Scope: `src/app/**`, `src/components/ui/*`, client libs, `tests/e2e/*`. Gates: `npm run lint` 0 errors / 21
warnings · `npm test` 357 passed · `npm run build:check` exit 0. No React Compiler in `next.config.mjs`, so
the hook warnings are advisory today. React 19.2.8 — `useEffectEvent` and `useSyncExternalStore` both stable
(verified via `require('react')`). Well-reasoned codebase: comments explain intent, the z-index ladder and
the server/client data boundary are real designs, and the e2e specs select by role so internal refactors are
cheap. Defects cluster in `GameClient.js`, one missing subscription (`theme.js`), and class strings that
escaped the variant system the repo already built.

## 1. Findings

**Critical:** none. `lib/regions.js` imports only generated data; `tests/regions.test.js` enforces it.

**H1 — `ThemeToggle` has the exact bug `SoundToggle` documents fixing.** `GameClient.js:550-555` mounts two
`ThemeToggle`s (compact + full, one `display:none`). `ThemeToggle.js:30-38` holds the choice in local state
seeded once per mount, no subscription; `SoundToggle.js:17-25` spells out why that is wrong and subscribes
via `watchSfxPreference`. Set the theme on the compact toggle, cross `sm` (rotate a phone), and the
three-cell group still highlights the old value — the first press goes the wrong way. Fix: give `theme.js`
the notify-on-write shape `audio.js` has, read via `useSyncExternalStore`. Also deletes `mounted` at
`ThemeToggle.js:33`.

**H2 — `username.js` is the only storage module with no `try/catch`.** `username.js:7-15` calls
`localStorage` bare; `theme.js:27`, `last-region.js:8`, `daily-progress.js:27`, `audio.js:56` all guard and
say why (blocked site data, private windows). `page.js:53` calls `getUsername()` in the landing effect, so a
throw takes out the whole home page. `FirstRoundHint.js:29,34,43` has the same exposure plus its own ad-hoc
key, bypassing the one-module-per-concern convention.

**H3 — `mapCenter` is state + an effect for a value that never changes.** `GameClient.js:118` seeds
hardcoded HCMC coords, `:207-209` overwrites them. `region` is a prop and `game/[region]/page.js:87` keys on
it, so this is a const (`pickedRegion?.center ?? DEFAULT_CENTER`). As written the map renders one frame at
the wrong centre on every region.

**H4 — `/` ships ~58 KB of Radix for dialogs that start closed.** `page.js:216,217` render `DonateQRModal` +
`UsernameModal` eagerly; `page.js:128` renders `LeaderboardModal` (Radix select + tabs + `RegionSelect`).
`next/dynamic` on `LeaderboardModal` and `DonateQRModal` moves most of that chunk off the landing path; both
are client-only already, so no SSR question.

- **M1** `src/app/debug/page.js:1` is `"use client"` with no client-only code — pure static card list.
  Delete the directive.
- **M2** The expanded guess map is modal but not a dialog: `GuessMapPanel.js:38-50` covers the phone screen,
  moves focus and eats Escape, but has no `role="dialog"`, no `aria-modal`, no focus trap, so Tab walks into
  the panorama behind it.
- **M3** `DebugFooter.js:83-89` puts `aria-live="polite"` on the button whose own `aria-label` changes — not
  announced reliably; `DailyCard.js:104` uses a separate `sr-only` node instead.
- **M4** `<html lang="en">` (`layout.js:78`) with Vietnamese proper nouns throughout. Structural fix, not
  per-string: route the `regionName()` renders at `GameClient.js:521`, `RegionPicker.js:110,158,175,178`,
  `RoundResultDialog.js:260` and `LeaderboardModal.js:92` through one `<PlaceName>` emitting `lang="vi"`.
- **M5** Three simultaneous polite live regions on the game screen (`GameClient.js:487,618,625` plus the
  dynamic-import fallback at `:31`) — a round swap can overlap announcements.
- **L1 (low)** `handleSkipGuess:438` has no in-flight guard; `handleNextRound:407` has one, so a same-tick
  double click fires two `/api/skip` calls and two loads.
- **L2 (low)** `GameClient.js:360` saves the daily result only `if (daily && dailyInfo)`. A `/api/daily`
  payload without `day` leaves `dailyInfo` null (`applyRound:159`): scored, not saved.

## 2. `GameClient.js` decomposition

713 lines, 17 `useState`, 5 `useRef`, ~220 lines of JSX. The lifecycle is correct — the epoch guards at
`:188,192,288,294,422,430` are load-bearing — but untestable without a browser, which is why none of the 357
unit tests touch it. The prize is turning the two epoch refs into reducer state, making the staleness rule a
pure testable function. Under `src/app/components/game/`:

| File | ~Lines | Responsibility |
|---|---|---|
| `round-api.js` | 60 | `fetchNewRound`, `submitGuess`, `skipSession`, `prefetchRound`. Lift of `:57-73`, `:246-283`, `:444-449`. No state. |
| `round-reducer.js` | 120 | Pure. State: `epoch, appliedEpoch, imageData, roundKey, sessionId, roundLoading, submitting, loadError, guess, result, showResult`. Actions: `ROUND_REQUESTED` (bumps epoch), `ROUND_APPLIED`, `ROUND_FAILED`, `GUESS_PLACED`, `SUBMIT_STARTED`, `SUBMIT_SETTLED`, `VIEWER_READY`, `WATCHDOG_FIRED`. Every stale check becomes `action.epoch !== state.epoch`. |
| `use-round.js` | 160 | `useReducer` + async commands (`start/next/skip/retry/submit/placeGuess`) + the 15s watchdog. Keeps `prefetchRef`, `initializingRef`, `mountedRef` — a held promise is not render state. Individual params: `useRound(region, daily)`. |
| `use-daily-replay.js` | 60 | Different lifecycle (one round, no prefetch, no skip, persisted). Owns `dailyInfo`, the replay branch `:211-223`, `saveDailyResult`. |
| `GameHeader.js` | 90 | Verbatim lift of `:501-583`. Props: `regionName, daily, dailyNumber, streak, sessionRounds, sessionPoints, onBack, onDonate`. |
| `PanoramaPane.js` | 70 | Verbatim lift of `:591-635` + the `PanoramaViewer` dynamic import. Props: `loadError, imageData, roundKey, roundLoading, hasGuess, onReady, onError, onRetry, onBack`. |
| `RoundActions.js` | 45 | Verbatim lift of `:657-687`. Props: `daily, hasGuess, canSubmit, submitting, roundLoading, onSubmit, onSkip`. |
| `GameClient.js` | 120 | Composition only: the hooks, derived `pickedRegion`/`regionName`/`mapCenter`, screen state (`mapExpanded`, `showDonate`, visit tally), layout, two dialogs. |

State placement: round lifecycle → reducer; screen-level but not round-scoped (`mapExpanded`, `showDonate`,
`sessionRounds`, `sessionPoints`) → `GameClient`; `username` → the store hook in §4; `pickedRegion`,
`regionName`, `mapCenter` → derived, never state.

**Keeping e2e green.** All five specs select by role, accessible name or visible text (`Submit Guess`,
`Place a guess first`, `Back to menu`, `Skip`, `Next Round`, `role=dialog name=/Round Result/`,
`.leaflet-container`); none reaches into structure, so the presentational extractions are safe as literal
cut-and-paste with zero markup edits. One caution: the breakpoint-swapping `<span>` wrappers at `:550-571`
must move into `GameHeader` intact — `audio.spec.js:80-81,95` asserts exactly one of each control per
viewport.

**Diff size.** `GameClient.js` −590, new files +605, `tests/round-reducer.test.js` +120; net ≈ +135 lines
over 8 files, ~1,300 touched. Two commits: presentational extraction first, then the reducer.

## 3. Lint-warning disposition

All 21 are `react-hooks/set-state-in-effect` or `react-hooks/refs`, checked individually.

| Site | Pattern | Disposition |
|---|---|---|
| `page.js:54`, `GameClient.js:242` | read username after mount | **Fix** — `useSyncExternalStore` (§4). Derive modal-open from a tri-state (`undefined` = not yet read), not a second setState. |
| `ThemeToggle.js:36`, `SoundToggle.js:40`, `RegionPicker.js:132` | read a stored value after mount | **Fix** — same hook. `audio.js` already exports getter + `watch*`, so `SoundToggle`'s effect deletes outright; `theme.js` (H1) and `last-region.js` need a `subscribe` added. |
| `DailyCard.js:31` | read daily progress after mount | **Fix, with caveat** — `getDailyProgress()` returns a fresh `JSON.parse` per call and `useSyncExternalStore` loops forever on an unstable snapshot. `daily-progress.js` must cache the parsed object and invalidate on write. |
| `FirstRoundHint.js:29,42` | `:29` reads hint-seen after mount; `:42` reacts to a prop | **Fix, two ways** — `:29` same hook (after H2 moves the key into a module); `:42` is not storage, so persist "seen" in `GameClient`'s `handleMapClick` (`:309`, an event handler) and pass `seen` down. |
| `UsernameModal.js:30`, `MapSearchBox.js:42` | reset state when a prop flips | **Fix** — remount by `key` (`key={showUsernameModal ? 'open' : 'closed'}`, `key={expanded}`) + lazy initial state. `RoundResultDialog.js:150` already uses this idiom. ~4 lines each. |
| `MapSearchBox.js:52` | `setPlaces([])` before a debounced fetch | **Fix** — store `{query, places}` as one object, derive `places = cached.query === query ? cached.places : []`. |
| `LeaderboardModal.js:64` | fetch-in-effect | **Fix** — the three triggers (open click, region change, type change) are all user events; move the call into the handlers. Also deletes the `exhaustive-deps` disable at `:65`. |
| `use-count-up.js:26` | `setShown(0)` when inactive | **Fix** — derive `shown = !active ? 0 : reduced \|\| !value ? value : counted`. The remaining `setShown` is inside `setInterval`, which the rule permits. |
| `debug/coverage/page.js:106` | reset 6 states on region change | **Fix (low priority)** — `key={region}` on the panel, or reset in the change handler. Debug-only. |
| `LeafletMap.js:35-36`, `PanoramaViewer.js:14-15`, `CoverageMap.js:39-40` | callback props → refs during render | **Fix** — `useEffectEvent`: `const emitReady = useEffectEvent((...a) => onReady?.(...a))`, called from inside the effect / from Leaflet handlers registered there. Sanctioned use case. |
| `CoverageMap.js:38` (`panosRef.current = panos`) | **data** in a ref, not a callback | **Disable with reason** — `useEffectEvent` does not apply to data; a dep would rebuild the canvas. The only true false positive of the 21. |

## 4. State duplication — is one storage hook worth it?

Partly. Do **not** add a generic `useStorage(key)`: the modules own validation (`username.js:26`),
serialisation (`daily-progress.js`) and defaults, which a key-string hook would throw away. Two narrower changes: (1) give every storage module the three exports `audio.js` already has —
`get*`, `set*`, `watch*` (notify on write); missing on `theme.js` (causes H1), `username.js`,
`last-region.js`, `daily-progress.js`. (2) One ~10-line `useStoredValue(getSnapshot, subscribe)` in
`src/lib/` over `useSyncExternalStore`, with a `getServerSnapshot` returning the module's SSR default. That
collapses the username triplication (`page.js:44`, `GameClient.js:117`, `UsernameModal.js:21`) to one
subscription each and fixes H1 as a side effect. `UsernameModal`'s copy stays local — draft form text, not
the stored value.

## 5. Styling

- **Button-like `<Link>`s**, two shapes. (a) *Card row*: `RegionPicker.js:66` and `debug/page.js:34` are
  near-identical 8-utility strings (`min-h-14 rounded-xl border p-4 shadow-xs hover:border-brand/40
  hover:shadow-md` + same focus ring) → a `cardRowVariants` cva beside `buttonVariants`. (b)
  `DailyCard.js:113` hand-rolls the default button variant; the repo's idiom is `<Button
  asChild><Link/></Button>`, used at `DailyCard.js:101` three lines above it.
- **`min-h-11` patched onto shadcn Buttons** at `GameClient.js:507,577`, `debug/layout.js:26`: all three are
  `size="sm"` (h-9) with the touch floor bolted back on, and `button.jsx:8-10` says "nothing should have to
  patch that in again". Add the missing size (`smTouch: "min-h-11 h-9 rounded-md gap-1.5 px-3"`). The
  `min-h-11` on plain `<a>`/`<summary>`/`<button>` (`page.js:119`, `RoundResultDialog.js:270,281`,
  `MapSearchBox.js:170`, `DebugNav.js:34`) is fine — not Buttons.
- **`focus-visible:ring-[3px] focus-visible:ring-ring`** in 15 files → `@utility vn-focus` in `globals.css`,
  beside the `--z-*` ladder. Leave vendored `ui/*` alone.
- **Safe-area expressions** at `GameClient.js:501,587`, `debug/layout.js:19`, `page.js:233` → `@utility
  safe-x` / `safe-top`, as `--footer-h` / `--action-bar-h` are already handled (`globals.css:248-251`).
- **`animate-fade-in-up` + 6 inline `animationDelay`** at `RoundResultDialog.js:194-218` → a
  `.reveal-sequence > *` nth-child rule in `globals.css`, so delays sit with the keyframes and the
  `prefers-reduced-motion` block already governing them (`globals.css:334-353`).

## 6. Server/client boundary and Next 16 conventions

Conventions correct: `params`/`searchParams` awaited as Promises (`game/[region]/page.js:76`,
`game/page.js:38`); `generateStaticParams` + `generateMetadata` on the region route; `metadata` on `/daily`,
`/credits`, `/not-found`; `viewport` split out of `metadata` (`layout.js:54`). No `middleware.js`, so the
`proxy.js` rename is not in play. `generateMetadata` correctly uses `regionFromSlug` over a throwing
`getRegion` — the reasoning at `:28-33` holds.

M1 is the only wrongly-marked route. `page.js:1` makes the whole home page client, which is coarse: hero
(`:140-147`), How to Play (`:157-185`), scoring and the attribution footer (`:200-213`) are static.
Splitting needs a small `UsernameGate` client component providing `interceptPlay` by context to `DailyCard`
+ `RegionPicker` — good for architecture, modest in bytes, since `RegionPicker` pulls the region tree and
needs `onClick`. `DonateQRModal.js:1` and `LeaderboardList.js:1` carry a redundant (not costly) `"use
client"`.

## 7. Bundle (measured from `.next-check`, Turbopack)

`/` = 13 chunks, 789 KB raw / 249 KB gzip. `/game/[region]` = 14 chunks, 740 KB / 233 KB. `/daily` 730 KB,
`/credits` 593 KB raw. Photo Sphere Viewer + three.js (623 KB) and Leaflet (145 KB) are correctly absent
from both first loads — confirmed by grepping the prerendered HTML. Remaining:

- **58 KB Radix chunk, `/` only** — dialog/select/tabs pulled by `LeaderboardModal` + `DonateQRModal`, both
  closed at first paint. H4, the best single win (accordion stays).
- **53 KB region tree in *both* first loads.** On `/` that is the picker rendering 85 rows, unavoidable
  while it is a client component. On `/game/[region]` its only consumers are `MapSearchBox` (`geo-search.js`
  → `searchRegions`) and one `regionSlug` at `RoundResultDialog.js:125` — yet `GuessMapPanel.js:6` imports
  `MapSearchBox` statically though it only renders over a map that is itself dynamic. Move it behind the
  same dynamic import.
- **~28 KB of lucide per route.** Confirm `optimizePackageImports` picks up `lucide-react`; 28 KB for ~10
  icons suggests the barrel is not shaken.

## 8. Prioritised actions

| # | Action | Effort | Risk |
|---|---|---|---|
| 1 | H1 subscribe `theme.js`, fix the double-mounted `ThemeToggle` | S | Low |
| 2 | H2 guard `username.js` + `FirstRoundHint`'s key; H3 derive `mapCenter`; L1 guard `handleSkipGuess`; M1 drop `"use client"` | S | Low |
| 4 | H4 `next/dynamic` on `LeaderboardModal` + `DonateQRModal` | S | Low |
| 5 | §3 the `useEffectEvent` / `key` / derive-don't-reset fixes (12 sites) | M | Low |
| 6 | §4 uniform `get/set/watch` + `useStoredValue`; collapse username triplication | M | Low |
| 7 | §2 phase 1 — extract `round-api`, `GameHeader`, `PanoramaPane`, `RoundActions` | M | Low |
| 8 | §5 `cardRowVariants`, `smTouch` size, `vn-focus` / `safe-x` utilities | M | Low |
| 9 | §2 phase 2 — `round-reducer` + `use-round` + reducer unit test | L | **Medium** |
| 10 | M2 make the expanded guess map a real dialog | M | Medium |
| 11 | M4 `<PlaceName lang="vi">`; §6 split `/` so the static half renders on the server | M | Low |
| 12 | M3, M5, L2, lucide check, `animate-fade-in-up` delays | S | Low |

Item 9 is the only Medium-risk item: the epoch guards encode bugs found the hard way (a late `ready` from an
outgoing viewer; a watchdog-released fetch replacing a live round). Move them into the reducer verbatim and
write the test *first* against current semantics.

## 9. Unresolved questions

1. **Playwright cannot run here** (no browser on this ARM64 host). Every claim about e2e staying green is a
  reading of the specs, not an execution — items 7 and 9 need `npm run test:e2e` on a machine with a browser
  before landing.
2. **Is the username interception at `page.js:92-98` still reachable?** Every exit from the modal (save,
  skip, dismiss) persists a name, so `getUsername()` is set after landing and `handlePlayClick` always
  returns `false`. If so, the `onPlayClick` prop threaded through `RegionPicker.js:52,64,138,141,175,178`
  and `DailyCard.js:111` is dead weight; removing it lets `RegionPicker` become a server component, which is
  what actually gets the 53 KB tree off `/`.
3. **`eslint.config.mjs:36-41`** documents the 21 warnings as deliberate; §3 disagrees for 20. Confirm the
  maintainer wants them fixed rather than the comment updated.
4. **Does `/api/daily` always carry `day`?** L2 depends on it; I did not read the route.
