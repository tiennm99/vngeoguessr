---
title: "Phase 4: SFX wiring"
status: completed
priority: P1
effort: "3h"
dependencies: [2, 3]
---

# Phase 4: SFX wiring

## Overview

Call `playSound` from the nine play-flow moments, with the result sound chosen
by score band.

## Requirements

- Functional: every trigger in the sound map fires exactly once per event; the result sound is tiered by score; a failed round plays `error`, not a score jingle.
- Non-functional: `playSound` is fire-and-forget — no `await` on a game path, no added latency, no state coupled to audio.

## Architecture

Call sites only. No new abstraction: `playSound('pin')` inside an existing
handler is one line and reads at the point it happens. A `useSound` hook or an
event bus would add indirection for nine literal calls — the wrong trade at
this size.

Result tier maps off the score already in `result`:

```js
// Result sounds follow the scoring ladder in lib/game.js: 4-5 points is
// within 100m and worth celebrating, 1-3 is a hit, 0 is a miss.
const resultSound = (score) => (score >= 4 ? 'great' : score > 0 ? 'good' : 'poor');
```

## Related Code Files

- Modify: `src/app/components/GameClient.js` — `handleMapClick` (:239), `handleSubmitGuess` (:260), `handleNextRound` (:308), `handleSkipGuess` (:341), `handlePanoramaError` (:223), `handleGoBack` (:377)
- Modify: `src/app/components/RegionPicker.js` — region selection click
- Modify: `src/app/page.js` — Play button
- Modify: `src/app/components/RoundResultDialog.js` — only if the reveal is animated and the sound must land with it rather than with `setResult`

## Implementation Steps

1. Import `playSound` into `GameClient.js`.
2. `handleMapClick`: `playSound('pin')` — first line, before state updates, so the sound is immediate.
3. `handleSubmitGuess`: `playSound('submit')` right after the `if (!guessCoordinates …) return;` guard, so a blocked submit stays silent.
4. Result: after `setResult(...)`, play `resultSound(submitted.score ?? 0)` on the success branch and `'error'` on both failure branches (`submitted` falsy, and the `catch`). The two failure paths already share one representation — the sound must too.
5. `handleNextRound`: `playSound('next')` after the `if (roundLoading) return;` guard — the guard exists because a double-click burns a session, and a double sound would be the audible tell.
6. `handleSkipGuess`: `playSound('skip')` after its guard.
7. `handlePanoramaError`: `playSound('error')`.
8. `handleGoBack` and the header buttons: `playSound('click')`.
9. `RegionPicker` selection and the home Play button: `playSound('click')`. These also serve as the first gesture, and the unlock listener from Phase 2 handles that — no explicit `unlockAudio()` call needed at these sites.
10. Play through a full round and listen for doubles, especially on the result reveal (the dialog mounts and the state updates in the same tick).
11. If the result sound lands before the dialog is visible, move it into `RoundResultDialog`'s open effect instead. Decide by ear, not by theory.

## Todo

- [x] `pin` on map click
- [x] `submit` on guess submit, after the guard
- [x] Tiered `great`/`good`/`poor` on a recorded result; `error` on both failure paths
- [x] `next` and `skip` on their handlers, after their guards
- [x] `error` on panorama load failure
- [x] `click` on region pick, Play, Back and header buttons
- [ ] Full round played through, no double-fires

## Success Criteria

- [ ] Each of the nine sounds is reachable in normal play
- [ ] No sound fires twice for one user action
- [ ] A blocked action (submit with no guess, double-clicked Next) makes no sound
- [ ] A failed round plays `error` and never a score jingle
- [ ] Turning SFX off in `SoundToggle` silences all of them and leaves music running
- [x] Round timing is unchanged — no `await playSound` on any game path

> **Boxes left open need ears or a live browser.** The code is written and the
> automated gates pass; these are the claims only a manual pass can make.
> Phase 6 lists them as one checklist.

## Risk Assessment

- **Double-fire on the result reveal.** Signal: an audible flam on the jingle. Response: the sound moves to the dialog's open effect, guarded so it fires once per result object.
- **`click` becomes noise.** Nine sounds is already a lot; a click on *every* button is the one most likely to grate. Signal: it is tiring after three rounds. Response: restrict `click` to navigational buttons (Play, region pick, Back) and drop it from the header chrome.
- **React 19 Strict Mode double-invokes effects in dev**, so any sound placed in an effect fires twice locally but once in production. Signal: doubles in dev only. Response: confirm against a production build before "fixing" it — do not add a ref guard for a dev-only symptom.
- **A sound plays for an action the player did not take** (prefetch failure, epoch mismatch on an abandoned round). Signal: `error` fires while nothing visible went wrong. Response: only play from user-initiated branches; the epoch guards in `handleNextRound` already mark the abandoned paths.
