---
title: "Phase 6: Verification and docs"
status: in-progress
priority: P2
effort: "2h"
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: Verification and docs

## Overview

Prove the audio layer works, breaks safely, and is written down.

## Requirements

- Functional: automated gates green; a manual pass over every acceptance criterion in `plan.md`; graceful degradation confirmed under blocked storage and missing files.
- Non-functional: docs updated only where user-visible behaviour or structure actually changed.

## Architecture

Unit tests cover the preference helpers; jsdom has no Web Audio implementation,
so a unit test of playback would assert a mock. Everything the browser *can*
honestly answer moved into `tests/e2e/audio.spec.js` instead: what is fetched
and when, whether the toggles persist, whether the header fits a phone,
and whether a 404 on every sound leaves the page working. What remains is
genuinely audible-only and belongs to a person with speakers.

## Related Code Files

- Create: `tests/e2e/audio.spec.js`
- Modify: `docs/features.md` — a Sound & Music section
- Modify: `docs/project-structure.md` — `src/lib/audio.js`, `SoundToggle.js`, `MusicPlayer.js`, `public/audio/`

## Implementation Steps

1. `npm test` — unit suite including `tests/audio.test.js`.
2. `npm run lint`.
3. `npm run build` — catches a server/client boundary violation that dev mode tolerates.
4. Verify the client-safety rule by grep: no `src/app/api/**` or server lib imports `src/lib/audio.js`.
5. Write `tests/e2e/audio.spec.js` and run `npm run test:e2e`.
6. Update the docs.
7. Hand the manual checklist below to the user.

## Todo

- [x] `npm test` green — 292 tests, 20 files
- [x] `npm run lint` green — 0 errors (20 pre-existing warnings, one of them the
      `set-state-in-effect` warning `ThemeToggle` already carries)
- [x] `npm run build` green
- [x] No server module imports `src/lib/audio.js`
- [x] `tests/e2e/audio.spec.js` written; full e2e suite green at 36 tests
- [x] `docs/features.md` and `docs/project-structure.md` updated
- [x] Asset size reported — 847 KB total: 61.5 KB of effects, 785.9 KB of music
- [x] Code review run; eight real findings fixed
- [ ] Manual pass below completed by the user

## Automated coverage

`tests/e2e/audio.spec.js` proves, in a real browser:

- No audio file is requested before the first user gesture.
- Music and effects persist independently; an untouched preference stays
  unwritten and reads as its default.
- A choice made on the menu is still in force inside a round.
- The game header fits 320px and 360px with zero horizontal overflow, showing
  the single mute switch and keeping the split pair out of the accessibility
  tree.
- The compact switch silences both channels at once.
- A 404 on every audio file leaves the page working and throws nothing.

That last group caught a real defect: `hidden` and `inline-flex` set the same
CSS property, so passing the breakpoint class straight to `SoundToggle` left
both variants visible on a phone. The class now goes on a wrapper element.

## Code review response

A `code-reviewer` pass over the whole diff returned twelve findings. Eight were
real; all eight are fixed, each with a regression test where one was possible.

| # | Finding | Resolution |
|---|---------|------------|
| 1 | Both toggles inert when localStorage is blocked — every playback decision re-read storage, so a refused write meant a mute that never applied | D9. Preference held in a module variable; storage demoted to a mirror. Covered by *stays muted in a private window* |
| 2 | The AudioContext was never resumed after the browser suspended it, contradicting the comment claiming otherwise | D10. Listeners stay registered; `visibilitychange` also resumes; `resume()` and the constructor are both guarded. Covered by *resumes a context the browser suspended* |
| 3 | The two mounted `SoundToggle`s desynced — rotating past `sm` showed mount-time state and the first press went the wrong way | Added `watchSfxPreference`; both variants now subscribe. Covered by the breakpoint e2e test |
| 4 | `playSound('error')` sat above the epoch guard, so an abandoned round's viewer could sound an error over a healthy one | Moved below the guard |
| 5 | The result jingle fired after an `await` with no liveness check — Back stays live during submit, so a win jingle could play over the menu | `mountedRef` guards all three post-await sounds |
| 6 | The `mounted` gate painted every load as muted before flipping, for a feature that defaults to on | Dropped. `useState(true)` already matches the server render, so there was no mismatch to guard against |
| 7 | The unit suite never opened a context, so the cache, its eviction and the playback guards had no coverage; one test was vacuous | Rewritten against a fake context, loading a fresh module per case. 12 tests to 24 |
| 8 | The 404 e2e test muted effects in the same gesture that unlocked audio, so it only exercised the music path, and `pageerror` cannot see unhandled rejections | Now drops a real pin with effects on, waits for the request, and records `unhandledrejection` from inside the page |
| 9 | `resultSound`'s insertion orphaned `fetchNewRound`'s JSDoc | Reordered |
| 10 | Gain nodes were never disconnected | `source.onended` releases both. Covered by *releases its nodes when the sound ends* |
| 11 | Docs overstated `click` and `error` coverage | Docs narrowed to what actually fires, with the reason |
| 12 | Music plays on `/credits` and `/debug/*`, beyond the menu-and-round wording of D2 | Recorded as D11 rather than changed: scoping it per-route is what restarts the loop |

## Manual pass (needs speakers)

- [ ] Play a full round: each of the nine effects is audible on its trigger
- [ ] Nothing double-fires, especially the jingle on the result reveal
- [ ] The three result jingles suit their tiers — `great` reads as a win,
      `poor` as a miss. These were picked by spectral measurement, not by ear,
      and are the likeliest thing in the plan to be wrong
- [ ] Music starts on the first click and never before it
- [ ] `/` → `/game/[region]` → Back plays continuously, with no restart
- [ ] The loop point is inaudible
- [ ] Muting music stops it instantly; unmuting restarts it; rapid clicking
      never stacks two loops
- [ ] Effects stay audible with music muted, and the reverse
- [ ] Levels sit right against each other and against the panorama
- [ ] Keyboard: both switches are tab-reachable with a visible focus ring
- [ ] No React hydration warning in the console on any page
- [ ] In a private window, sound still plays and nothing throws

## Success Criteria

- [x] All four automated gates pass
- [x] Nothing under `public/audio/` lacks a `SOURCES.md` row
- [x] Docs describe the audio layer accurately, with no claim not backed by the code
- [ ] Every checkbox in `plan.md`'s Success Criteria is ticked against observed behaviour

## Risk Assessment

- **The manual pass gets skipped because the automated gates are green.** Signal: acceptance criteria ticked with no described observation. Response: the by-ear boxes in phases 3-5 were deliberately reopened after `ak plan check` ticked them wholesale; they stay open until someone listens.
- **Docs drift into aspiration** for things the plan explicitly does not build. Response: the non-goals in `plan.md` stay non-goals; the docs describe shipped behaviour only.
- **e2e flake from audio timing.** Signal: intermittent failures. Response: the spec asserts localStorage, DOM and network state only — never playback. If it flakes, it is asserting the wrong thing.
