# Client Round State Machine — Recheck (working tree, 2026-08-31 21:45)

Adversarial read-only pass over the `roundKey` / epoch / watchdog rework in
`src/app/components/GameClient.js` + `RoundResultDialog.js`, read against
`PanoramaViewer.js` and `GuessMapPanel.js` (both unchanged). Advisory only; no
code modified.

Gate re-run: `npx vitest run` → **243 passed / 15 files**. E2E and build not run
per instruction. React 19.2.8, Radix Dialog 1.1.19, Next 16.3.3.

Prior H1 (epoch guard) from `code-reviewer-260831-2117-breaking-change-recheck.md`
is implemented and closes the branch it was written for (watchdog fires → player
starts another load → stale result discarded). It does **not** close the branch
where the player starts no further load, which is H1 below.

Verdict: no contract break, no crash path, no permanently-stuck `roundLoading`.
One real scoring hazard (H1) and three state-consistency holes, all in the same
post-watchdog window and all fixable with four small edits.

---

## Critical

None.

## High

### H1 — The watchdog releases the controls but never invalidates the in-flight fetch: a stale round lands with the player's guess still attached

`GameClient.js:203-207` (watchdog), `GameClient.js:99-107` (`applyRound`),
`GameClient.js:109-125` (`loadRound`).

`roundEpochRef` is bumped only by load-*starting* actions (`:136`, `:281`,
`:327`, `:337`). The watchdog bumps nothing. So when the player takes no further
action after the watchdog fires, the in-flight load still carries the current
epoch and `applyRound` runs.

Sequence (fetch stalls; `fetch()` has no `AbortSignal`, browser default is
minutes, so >15 s on mobile is ordinary):

1. Skip (or Next Round) → `roundLoading = true`, `setSessionId(null)` (`:329`),
   `imageData` still round A's → viewer still shows A.
2. t=15 s → watchdog → `roundLoading = false`. Submit/Skip re-enable; the
   between-rounds overlay (`:435`) disappears. **The guess map was never
   disabled** (`GuessMapPanel` takes no loading prop), so it was clickable the
   whole time.
3. Player, looking at panorama A, clicks the map → `guessCoordinates` = a guess
   for A.
4. t=20 s → fetch resolves → epoch matches → `applyRound(roundB)` → `imageData`,
   `sessionId`, `roundKey` all become B. `guessCoordinates` is **not** cleared —
   `resetRoundState` (`:271`) ran back at step 1, before the guess existed.
5. `roundLoading` is already false and is never re-raised, so Submit is enabled
   immediately. Player clicks Submit → `/api/guess` scores **A's guess against
   B's session**, and credits B's resolved district on the leaderboards.

Impact: a leaderboard entry the player did not make, plus the panorama swapping
under them unprompted. This is exactly the invariant the epoch work was meant to
hold ("no stale result/guess leaking into the next round"), and it is open on the
no-further-action path.

Same shape, second entry point: `handleRetryLoad` (`:335-341`) never calls
`resetRoundState`, so a guess placed while the error panel is up (the map is live
there too; Submit is only blocked by `!imageData`) survives into the retried
round.

Fix — one line closes both, and is a no-op on every happy path because
`resetRoundState` already ran:

```js
const applyRound = useCallback((data) => {
  setSessionId(data.sessionId);
  setImageData({ url: data.imageData.url, isPano: data.imageData.isPano });
  setRoundKey((key) => key + 1);
  // A round that arrives after the watchdog gave the controls back (or after a
  // retry) must never inherit a guess aimed at the panorama it replaces.
  setGuessCoordinates(null);
  setLoadError(null);
}, []);
```

Stronger option, if you want the watchdog to actually abandon the load rather
than race it: track a `fetchInFlightRef`, and in the watchdog do
`roundEpochRef.current += 1; setLoadError('That round took too long to load.');`
only when a fetch is in flight (when it is not, the stall is the viewer's texture
and the current behaviour — hand the controls back, keep the panorama — is
right). Note the current invariant "every epoch bump owns `roundLoading = true`"
becomes "…or has already cleared it"; both are safe, since `loadRound` returning
`true` for a stale epoch means "nothing to clear".

## Medium

### M1 — Submit is gated on `imageData` but not on `sessionId`, and the two are unpaired for the whole load window

`GameClient.js:463` (`disabled={!guessCoordinates || !imageData || submitting || roundLoading}`)
and `GameClient.js:231` (same condition in the handler).

Between `setSessionId(null)` (`:285`, `:329`) and `applyRound`, `sessionId` is
null while `imageData` still holds the previous round. `roundLoading` normally
covers that window — except after the watchdog (H1 step 2), and except after M3
below. Submit then runs with `sessionId === null`, `submitGameResult` bails at
`:162` and returns null, and the player gets the **"Round Not Recorded"** dialog
for a round that was never live — plus `startPrefetch(location, null)` (`:265`)
burns a fresh server session behind the dialog.

Fix: add `!sessionId` to both the button's `disabled` and the handler's early
return. Cheap, and it makes the pairing invariant explicit rather than implied by
`roundLoading`.

### M2 — Skip from the error state never clears `loadError`: the recovery looks dead until the fetch lands

`GameClient.js:310-333`. `handleSkipGuess` now accepts the error state
(`if (!imageData && !loadError) return`, `:311`) but never resets `loadError`.
During the ensuing load:

- the error panel keeps rendering (`:403`, `loadError` is checked first);
- the between-rounds spinner is suppressed by `roundLoading && !loadError`
  (`:435`);
- "Try again" goes `disabled={roundLoading}` (`:411`).

So the screen shows the same failure message with both buttons inert and no
progress indicator, for as long as the fetch takes. It recovers correctly
(`applyRound` clears `loadError`), but the feedback gap is indistinguishable from
a hang. `handleRetryLoad` does clear it (`:336`) — the two entry points
disagree.

Fix: `setLoadError(null)` as the first line of `handleSkipGuess`'s load section
(after the `/api/skip` call), matching `handleRetryLoad`.

### M3 — A late `ready` from the *previous* round's viewer clears the *next* round's `roundLoading`

`GameClient.js:190-192` (`handlePanoramaReady`), `GameClient.js:421-426`
(`key={roundKey}`).

`roundKey` only changes in `applyRound`, so from the start of a load until the
new data lands, the mounted viewer is still the previous round's instance.
`PanoramaViewer`'s `disposed` flag (`PanoramaViewer.js:64, 88`) only suppresses
`ready` from an *unmounted* run — this instance is very much mounted. If its
texture finishes during the load window (the exact scenario the watchdog exists
for: slow texture, watchdog fired, player pressed Skip, texture then completes),
`onReady` fires and clears the loading state of a round that has not arrived.

Consequence: overlay vanishes, Submit/Skip re-enable mid-fetch → feeds directly
into M1, and a second Skip issues a parallel `/api/new-game` (the first is then
epoch-discarded, so no corruption — just an orphaned session).

Fix — reuse the epoch, no new machinery:

```js
const appliedEpochRef = useRef(0);
// inside applyRound (which only runs with a current epoch):
appliedEpochRef.current = roundEpochRef.current;

const handlePanoramaReady = useCallback(() => {
  // A viewer from the round being replaced must not clear its successor's wait.
  if (appliedEpochRef.current !== roundEpochRef.current) return;
  setRoundLoading(false);
}, []);
```

Apply the same guard to `handlePanoramaError` (`:194-197`).

## Low

- **L1 — Double announcement on the failed round.** `RoundResultDialog.js:90`
  keeps `role="alert"` on the failure body while `:75-81` now carries the same
  outcome in the `aria-describedby` description. Screen readers get it twice on
  open. Drop the `role="alert"` — the description is the reliable channel and
  the reason the previous `role="status"` block was removed.
- **L2 — `formatDistance(undefined)` renders "NaNkm".** `RoundResultDialog.js:79`
  formats `result.distance` unconditionally. `/api/guess` always sends it, so
  this is unreachable in prod today, but the sr-only string is the one place a
  malformed payload would be spoken rather than seen. `typeof result.distance === 'number'`
  guard, or omit the clause.
- **L3 — Epoch read inline vs captured.** `handleNextRound` captures
  `const epoch = roundEpochRef.current` (`:282`); `handleSkipGuess` (`:331`),
  `handleRetryLoad` (`:339`) and `loadLibrariesAndInitialize` (`:137`) pass
  `roundEpochRef.current` directly as an argument. Correct today (evaluated
  before the `await`), but it is one refactor away from reading the ref after a
  suspension point. Make all four capture first.
- **L4 — Dead `try` around a fire-and-forget fetch.** `GameClient.js:313-323`:
  `fetch()` does not throw synchronously here and already has `.catch`. The outer
  `try/catch` can never fire. Pre-existing; noted because the nesting reads as if
  it protects something.
- **L5 — Pre-existing, re-verified unchanged (prior L7/L8):** Skip's DEL/SET race
  (`:315` unawaited `/api/skip` then `:331` reuses the same id) and the first
  round having no spinner over the viewer (`initialLoading` clears when the fetch
  returns, `roundLoading` is never raised for the initial load). Neither is
  touched by this delta.

---

## Interleaving walk

`roundLoading` lifecycle, all entry points. "Watchdog" is armed by
`useEffect [roundLoading]` and is pending in every row.

| Entry | Raises at | Clears on success | Clears on failure | Clears on stall |
|---|---|---|---|---|
| `handleNextRound`, prefetch hit | `:289` | `applyRound` → `roundKey`++ → viewer remount → `ready` (`:191`) | prefetch rejects → falls through → `if (!loaded) setRoundLoading(false)` (`:307`) | watchdog `:205` |
| `handleNextRound`, no/failed prefetch | `:289` | remount → `ready` | `:307` | watchdog |
| `handleSkipGuess` | `:330` | remount → `ready` | `:332` | watchdog |
| `handleRetryLoad` | `:338` | remount → `ready` | `:340` | watchdog |
| initial load | never raised | n/a (`initialLoading` clears in `finally`, `:146`) | `loadError` panel | n/a |

Checked and clean:

- **No dangling `roundLoading = true`.** Every epoch bump that can strand a load
  (`:281`, `:327`, `:337`) also raises `roundLoading` in the same handler, so a
  discarded load's "nothing to clear" is always true — the newer action owns the
  flag and armed its own watchdog. The one bump that does not (`:136`, init) runs
  under `initialLoading`, which clears in `finally`.
- **Watchdog cannot be short-changed.** The effect re-runs only on a
  `false → true` transition, so the 15 s always starts when the wait starts. A
  second `setRoundLoading(true)` while already true would inherit a partly-spent
  timer — unreachable, because every entry point is either `disabled` on
  `roundLoading` (`:411`, `:472`) or guarded (`:280`).
- **`roundKey` does its job.** Viewer keyed on the counter, `PanoramaViewer`'s
  effect deps `[imageUrl]`, so a repeated panorama URL still remounts and still
  fires `ready`. The dead state the previous review warned about is closed.
- **`panorama-error` clears too.** `PanoramaViewer.js:67-71` calls `onReady`
  alongside the flat-image fallback; the constructor `catch` (`:72-77`) calls
  both `onReady` and `onError`. The only path firing neither is the
  never-settling texture promise — the watchdog's stated purpose.
- **Prefetch consumed exactly once.** Read-and-null is synchronous (`:287-288`),
  Skip clears it (`:326`), the abandoned promise carries a detached `.catch`
  (`:226`) so it cannot surface as an unhandled rejection. Menu leaves one
  self-expiring session, as documented.
- **Submit is not concurrent with any load.** During `submitting`, Skip is
  disabled (`:472`) and Retry is not rendered; `submitting` clears at `:263`
  outside the try/catch, so no path leaves the button spinning.
- **Session/imageData pairing at rest.** `applyRound` writes both in one batch,
  so whichever load wins leaves a consistent pair. The only unpaired window is
  during a load — see M1.

## Epoch guard completeness (check 2)

Every writer of round-scoped state, and whether a stale epoch can reach it:

| Writer | Site | Guard |
|---|---|---|
| `applyRound` (session + image + key + error) | `:115` via `loadRound` | `:114` ✓ |
| `applyRound` | `:295` prefetch resolve | `:294` ✓ |
| `setImageData(null)`/`setSessionId(null)`/`setLoadError` | `:120-122` | `:118` ✓ |
| prefetch **reject** → fall-through to `loadRound` | `:299-303` | `:302` ✓ — and the subsequent `loadRound(…, epoch)` re-checks with the same epoch, so a bump during the fresh fetch is caught too |
| `setLoadError(null)` | `:336` retry | synchronous in the handler, no await before it ✓ |
| `setRoundLoading(false)` | `:307`, `:332`, `:340` | reached only when `loadRound` returned `false`, which it never does for a stale epoch ✓ |
| `setRoundLoading(false)` | `:191`, `:196` viewer callbacks | **unguarded — M3** |
| `applyRound` after the watchdog with no newer action | `:115` | epoch still current by construction — **H1** |

## React correctness (check 3)

- **`router.push('/')` with a fetch in flight.** `handleGoBack` bumps no epoch,
  so a resolving `loadRound`/prefetch may call `setState`. On React 19 that is a
  silent no-op after unmount (the "update on unmounted component" warning was
  removed in 18) and a harmless extra render if the navigation has not committed
  yet. Nothing worse; no listener, timer or viewer is leaked — the watchdog and
  `PanoramaViewer` both clean up in their effect returns.
- **Dep arrays.** `[roundLoading]` on the watchdog captures nothing else.
  `[searchParams, loadLibrariesAndInitialize, initialized]` on the init effect:
  `loadLibrariesAndInitialize` → `loadRound` → `applyRound` all have empty/stable
  dep chains, so the identity is stable and the effect is driven only by the
  `initialized` gate.
- **StrictMode.** The init effect's double-invoke is absorbed by
  `initializingRef` (a ref survives the remount, state does too, so the second
  run returns at `:128` and issues no second fetch). The watchdog effect's
  double-invoke clears its own timer in the cleanup — one live timer.
  `useCountUp`'s interval likewise. No duplicated `/api/new-game` in dev.
- **`handleNextRound`'s `if (roundLoading) return`** reads render state, not a
  ref (prior L1, still open). Two clicks dispatched in one task would both read
  `false`. Practically closed here because `DialogContent`'s
  `key={open ? 'open' : 'closed'}` (`RoundResultDialog.js:60`) forces the content
  to unmount the instant `open` flips rather than lingering through the exit
  animation — but that is an accident of the key, not a guard. The M3 fix does
  not help; use a ref or `disabled` on the button if you want it unconditional.

## Dialog (check 4)

- **Esc / overlay / close.** `showCloseButton={false}` removes the X;
  `onOpenChange={() => {}}` swallows Radix's dismiss request. Radix still runs
  its dismiss path (`onEscapeKeyDown` → `onOpenChange(false)`), the controlled
  `open` stays true, nothing re-renders differently — no strand, no crash, no
  focus-trap leak. Repeated Esc is idempotent. Two labelled exits remain
  (Next Round, Menu), so the modal is not a dead end.
- **Count-up.** `useCountUp(score, open)` lives above `DialogContent`, so the
  content's key flip does not reset it; `open → false` sets it to 0, and a repeat
  score on the next round re-animates because `active` toggled. `failed` results
  have `score = 0` and take the `!value` short-circuit — no timer spun.
- **aria.** The description carries the *final* score, not `shownScore`, so the
  announcement never races the animation. It is always rendered (empty string
  when `result` is null), so Radix never warns about a missing description, and
  `showResult` is only ever set in the same batch as `setResult`, so the empty
  case is unreachable. See L1 for the one duplication.

## Metrics

- Tests: 243 passed / 15 files (`npx vitest run`), matching the expected count.
- Lint/type/build: not re-run per instruction.
- Type coverage: n/a (JavaScript-only repo).

## Recommended actions

1. H1 — clear `guessCoordinates` in `applyRound` (one line). Decide separately
   whether the watchdog should abandon the fetch outright.
2. M1 — add `!sessionId` to Submit's `disabled` and to `handleSubmitGuess`.
3. M3 — epoch-guard `handlePanoramaReady` / `handlePanoramaError`.
4. M2 — clear `loadError` in `handleSkipGuess`.
5. L1-L3 sweep — all inside the two touched files.

## Unresolved questions

1. Should the 15 s watchdog *abandon* a stalled round fetch (error + retry) or
   keep racing it? Abandoning is safer but throws away a round that may be two
   seconds from arriving.
2. Should the guess map be inert while `roundLoading` is true? Every finding
   above is reachable only because it stays live across the round boundary.
