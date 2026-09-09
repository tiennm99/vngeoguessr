---
title: "Game audio: music and SFX"
description: "Add CC0-sourced sound effects and a background music loop to the play flow, with split music/SFX toggles and a gesture-gated Web Audio core"
status: in-progress
priority: P2
effort: "2d"
tags: [audio, ui-ux, assets]
created: 2026-09-09
---

# Game audio: music and SFX

## Overview

Give VNGeoGuessr a voice: ~9 one-shot sound effects on the play flow's key
moments, plus a background music loop that runs on the menu **and** during the
round. Both default on, both independently mutable, both persisted like the
theme.

Source research:
[`plans/reports/research-260909-0917-game-audio-free-sources.md`](../reports/research-260909-0917-game-audio-free-sources.md).

**Contract**
- **Outcome:** the game makes sound. SFX confirm every interaction; music plays
  continuously across menu and round; a player can silence either one in two
  clicks and the choice sticks.
- **Constraints:** JavaScript only, individual function parameters; no new npm
  dependency; audio code is client-only; `src/lib/` changes run `npm test`;
  binary assets go in `public/audio/` with a per-file license manifest;
  everything ships CC0 or Pixabay-Content-License (commercial, no attribution).
- **Non-goals:** volume sliders, spatial audio, dynamic music layering, an audio
  settings modal, voice-over, per-region music.
- **Acceptance:** see [Success Criteria](#success-criteria).

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | No audio library. Own `src/lib/audio.js` on the Web Audio API | 9 one-shots + 1 loop. Howler's ~9 KB gz buys sprites, fades and spatial audio we do not use. Revisit past ~15 sounds or when crossfades are wanted |
| D2 | Music plays on menu **and** in-round, default **on**, at low gain (0.15 vs 0.40 for SFX) | User decision 2026-09-09. Low gain is the mitigation for music competing with the "read the scene" task |
| D3 | Split music/SFX toggles, two localStorage keys, mirroring `src/lib/theme.js` | User decision 2026-09-09. Reuses an established, tested preference pattern |
| D4 | Music lives in a client component mounted in the root layout | `/` → `/game/[region]` is a client navigation; anything mounted per-page restarts the loop on every route change |
| D5 | Unlock the AudioContext from a one-shot document-level `pointerdown`/`keydown` listener | Music is default-on and the first gesture can be the username modal, the region picker, or Play — no single handler owns it |
| D6 | MP3 for SFX; WebM/Opus with MP3 fallback for the music loop, looped through a decoded Web Audio buffer | MP3 encoder padding makes an audible gap on loop; a decoded buffer with `loop = true` is gapless regardless. Safari decodes Opus-in-WebM only from 18.4, hence the fallback |
| D7 | CC0-first sourcing, with a committed `public/audio/SOURCES.md` manifest and a Credits entry | Licenses on Freesound/OpenGameArt/Pixabay are per-file, not per-site. The manifest is the audit trail; the Credits card matches how every other asset in this repo is treated |
| D9 | Preferences live in a module variable, mirrored into localStorage rather than read back from it | A private window throws on both read and write. Reading the flag back before every sound made a mute that could not be persisted a mute that never happened — the player had no way to silence the game. `theme.js` can read on every call because it drives a class name the browser then owns; here the value gates playback |
| D10 | The gesture listeners stay registered for the life of the page | Backgrounding a tab suspends the AudioContext on mobile and it does not resume on its own. Removing the listeners after the first gesture left the game silent for the rest of a session once the phone had been locked |
| D11 | Music is mounted app-wide, so it also plays on `/credits` and `/debug/*` | A consequence of D4, recorded rather than worked around: scoping it to the menu and game routes would mean mounting it per-route, which is exactly what restarts the loop on navigation |
| D8 | Below `sm`, the game header shows one combined mute button; `sm+` shows the split pair | The game header already carries Back + badges + ThemeToggle (132px) + Beer. Two more 44px buttons overflow a 360px viewport. Split control stays available at every size on the home header |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Legally-clean CC0/Pixabay audio assets committed with a license manifest | P1 |
| 2 | A client-only audio core: gesture unlock, lazy decode, two persisted preferences | P1 |
| 3 | Split music/SFX controls in the app chrome, on every header | P1 |
| 4 | SFX on the nine play-flow moments | P1 |
| 5 | A gapless background loop that survives client navigation | P1 |
| 6 | Tests, lint, build and docs green | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Audio assets and licensing](./phase-01-audio-assets.md) | Done |
| 2 | [Phase 2: Audio core module](./phase-02-audio-core-module.md) | Done |
| 3 | [Phase 3: Sound controls](./phase-03-sound-controls.md) | Done |
| 4 | [Phase 4: SFX wiring](./phase-04-sfx-wiring.md) | Done |
| 5 | [Phase 5: Background music](./phase-05-background-music.md) | Done |
| 6 | [Phase 6: Verification and docs](./phase-06-verification-and-docs.md) | Manual pass open |

Dependencies: 2 needs 1 (filenames fixed). 3 needs 2. 4 needs 2 and 3. 5 needs
2 and 3. 6 needs everything.

## Sound map

| Key | Trigger | Character |
|-----|---------|-----------|
| `click` | Any header/menu button, region pick | short dry UI click |
| `pin` | `handleMapClick` — guess marker dropped | soft pop |
| `submit` | `handleSubmitGuess` | rising whoosh |
| `great` | Result reveal, score >= 4 (<= 100 m) | bright 2-note jingle |
| `good` | Result reveal, score 1-3 | neutral chime |
| `poor` | Result reveal, score 0 | soft descending tone |
| `next` | `handleNextRound` | light transition swoosh |
| `skip` | `handleSkipGuess` | flat neutral blip |
| `error` | `handlePanoramaError`, failed submit | low error tone |
| `music` | Loop, menu + in-round | calm ambient, ~60-90 s, seamless |

Score tiers come from `SCORE_BANDS` in `src/lib/game.js` (5/4/3/2/1 points at
50/100/200/500/1000 m).

## Risks

| Risk | Signal it is happening | Response |
|------|------------------------|----------|
| Default-on music annoys players and they mute permanently | Anecdotal feedback; the mute toggle is the first thing touched | Ship at 0.15 gain, keep the toggle one click away. If it lands badly, flip the music default to off — a one-constant change in `src/lib/audio.js` |
| iOS Safari refuses to start music until a gesture | Music silent on iOS until the first tap | Accepted and unavoidable — no browser allows unmuted autoplay. The unlock listener starts it on the first tap |
| Header overflows on small phones | Horizontal scroll or wrapped chrome at 360px | D8: combined mute button below `sm` |
| ~1.2 MB of binary assets in a git repo | Clone/checkout time | Accepted. Budget: SFX total <= 200 KB, music <= 1 MB. Exceeding it means re-encoding, not adding a CDN |
| Music restarts on every route change | Audible re-start walking `/` → `/game/x` → back | D4: mounted in the root layout, not per-page |
| A sourced file turns out to be CC-BY-NC or mislabelled | Manifest review finds a license that is not CC0/Pixabay | Replace the file. The manifest exists precisely so this is caught before shipping |

## Success Criteria

- [x] Every file in `public/audio/` is CC0 or Pixabay Content License, recorded in `public/audio/SOURCES.md` with source URL, author and license
- [x] `npm test` passes, including new tests for the audio preference helpers
- [x] `npm run lint` and `npm run build` pass
- [ ] All nine SFX fire on their triggers; none fires more than once per event.
      Narrowed 2026-09-09: `click` fires on Play and Back only — on every button
      in the chrome it is noise. `error` fires when the panorama viewer fails to
      construct, not on `panorama-error`, which falls back to a flat image and
      leaves the round playable, so a failure tone would be a lie
- [ ] Music starts on the first user gesture, plays through `/` → `/game/[region]` → back without restarting, and loops with no audible gap
- [x] Music and SFX toggle independently; both choices survive a reload
- [ ] With site data blocked (private window), the app plays sound and does not throw
- [x] No horizontal overflow in any header at 320px and 360px width
- [x] No audio request fires before the first user gesture (verify in DevTools Network)
- [x] A missing or corrupt audio file degrades to silence, never to a broken screen
- [x] `/credits` lists the audio sources
- [x] `docs/features.md` and `docs/project-structure.md` mention the audio layer

The four criteria still open — the nine effects firing once each, the music
playing unbroken across a navigation and looping without a gap, and sound
surviving a private window — need speakers and a real session. Phase 6 carries
them as a checklist.

## Open questions

- ~~Music track character: neutral ambient, or Vietnamese instrumentation?~~
  **Resolved 2026-09-09 in Phase 1.** OpenGameArt's CC0 catalogue holds no
  Vietnamese or broadly Southeast Asian instrumentation — a licence-filtered
  search returns two Japanese-themed tracks and nothing else. The loop is
  neutral ambient. Swapping it later needs no code change.

<!-- slug: game-audio-music-and-sfx -->
