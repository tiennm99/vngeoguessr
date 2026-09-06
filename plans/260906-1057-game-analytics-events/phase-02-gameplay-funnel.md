---
phase: 2
title: "Gameplay funnel"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Gameplay funnel

## Overview

Instrument the round lifecycle in `GameClient.js`: round started, guess
submitted, round skipped, and how the player leaves the result dialog. This is
the phase that makes region popularity, accuracy distribution and skip rate
measurable.

## Requirements

**Functional**
- `round_started` fires exactly once per round that reaches the screen, tagged
  with what caused it.
- `guess_submitted` fires on a recorded guess, carrying points and distance band.
- `round_skipped` fires when the player skips.
- `round_result_exit` fires with `next` or `menu`.

**Non-functional**
- No change to any state transition, epoch guard or early return in
  `GameClient.js`. Calls are additive only.
- No emit inside a render body.
- A superseded round (epoch mismatch) must not emit `round_started`.

## Architecture

`GameClient.js` already has exactly the seams needed; every emit attaches to an
existing handler.

| Emit site | Existing code | Why here |
|---|---|---|
| `round_started` | `applyRound(data)` | The single place a round reaches the screen. Both the prefetch path and the plain fetch path funnel through it, and it already runs after the epoch check — a superseded round returns before reaching it |
| `guess_submitted` | `handleSubmitGuess`, inside `if (submitted)` | Only a recorded round has points and a distance |
| `round_skipped` | `handleSkipGuess`, before the reset | `location` is still the round's region there |
| `round_result_exit` | `handleNextRound` / `handleGoBack` | The two exits from the dialog |

**The `source` property.** `applyRound` cannot tell what called it, so the
callers set it. Add a `roundSourceRef` (a ref, not state — it must not trigger a
render) that each entry point writes before its load: `'initial'` in
`loadLibrariesAndInitialize`, `'next'` in `handleNextRound`, `'skip'` in
`handleSkipGuess`, `'retry'` in `handleRetryLoad`. `applyRound` reads and emits it.

**Why a ref and not a parameter.** `applyRound` is a `useCallback` consumed by
`loadRound`, which is itself a `useCallback` dependency of
`loadLibrariesAndInitialize`. Threading a parameter through both changes two
signatures and their dependency arrays; a ref adds one line and touches no
existing contract.

**The region comes from the response, not the closure.** `/api/new-game`
already returns `region: { code, name, path, level }` via `publicRegion()`
(`src/lib/region-request.js:73`), verified in
`src/app/api/new-game/route.js:126`. `applyRound(data)` therefore reads
`data.region.code` and `data.region.level` directly. This matters: `applyRound`
is a `useCallback` with an empty dependency array, and reaching for the
`location` state instead would force `location` into that array, re-creating
`applyRound` → `loadRound` → `loadLibrariesAndInitialize` on every region
change — the last of which is a dependency of the init effect. Using the
response keeps the array `[]` and the effect chain untouched.

**`round_result_exit` from `handleGoBack`.** `handleGoBack` is also the header's
Back button, which is not a result-dialog exit. Gate the emit on `showResult`
being true so the header press does not report as a result-screen exit.

## Related Code Files

- Modify: `src/app/components/GameClient.js`
- Read for reference: `src/lib/analytics.js` (Phase 1)

## Implementation Steps

1. Import the four event wrappers from `../../lib/analytics`.

2. Add `const roundSourceRef = useRef('initial');` beside the existing refs.

3. In `applyRound`, after `setLoadError(null)`, emit `round_started` with
   `data.region.code`, `data.region.level` and `roundSourceRef.current`.
   Leave the `useCallback` dependency array as `[]` — the response carries
   everything the event needs, so nothing new enters the closure.

4. Set `roundSourceRef.current` at each of the four entry points named above,
   before the load begins.

5. In `handleSubmitGuess`, inside the `if (submitted)` branch, emit
   `guess_submitted` with `location`, level, `submitted.score ?? 0`, and
   `distanceBand(submitted.distance)`.

6. In `handleSkipGuess`, emit `round_skipped` before `resetRoundState()`.

7. In `handleNextRound`, emit `round_result_exit` with `action: 'next'` after
   the `roundLoading` early return (a double-click must not double-count).

8. In `handleGoBack`, emit `round_result_exit` with `action: 'menu'` only when
   `showResult` is true.

9. Verify manually: `npm run dev`, play through country / province / district
   rounds, watch the console with analytics debug on, confirm one
   `round_started` per round and correct `source` values.

10. Run `npm test`, `npm run lint`, `npm run test:e2e`.

## Todo

- [ ] `roundSourceRef` added and set at all four entry points
- [ ] `round_started` in `applyRound`, epoch-safe, no double-fire
- [ ] `guess_submitted` with points and band
- [ ] `round_skipped`
- [ ] `round_result_exit` for both exits, gated on `showResult` for Back
- [ ] Manual dev-console verification across all three region levels
- [ ] `npm test`, `npm run lint`, `npm run test:e2e` green

## Success Criteria

- [ ] Exactly one `round_started` per round visible on screen — verified across
      an initial load, a Next Round, a Skip and a Retry
- [ ] A superseded round (fast Skip during a slow load) emits no `round_started`
- [ ] `guess_submitted` band matches the dialog's displayed distance
- [ ] A failed guess (`result.failed`) emits no `guess_submitted`
- [ ] The header Back button outside the result dialog emits no
      `round_result_exit`
- [ ] 9/9 e2e specs still pass; no game behavior changed

## Risk Assessment

**Double-fire of `round_started`.** The likeliest defect: `applyRound` runs
once per round, but React 19 Strict Mode double-invokes effects in dev, and a
future refactor could call it twice. Signal: two console entries per round in
dev. Response: `applyRound` is not an effect, so Strict Mode does not affect it
— but confirm during step 9 rather than assuming. If a genuine double-call
appears, dedupe on `appliedEpochRef` rather than adding a boolean.

**A `useCallback` dependency array grows during implementation.** If any emit
reaches for component state instead of the values already in scope,
`applyRound`'s `[]` array grows, re-creating `loadRound` and
`loadLibrariesAndInitialize` — the latter a dependency of the init effect.
Signal: a round re-fetches on mount, or the init effect loops. Response: keep
every emit's inputs to what the handler already holds; `round_started` reads
`data.region`, and the other three run in handlers where `location` is already
a legitimate closure read.

**`round_skipped` reports the picked region, not the resolved one.** In
`handleSkipGuess` the only region available is `location` (what the player
picked); the panorama's actual district is deliberately server-side. That is
correct for this event — skip rate is a property of what the player chose to
play — but do not later "fix" it by reaching for a resolved district, which
would leak the answer to the client.
