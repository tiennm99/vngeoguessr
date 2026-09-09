---
title: "Phase 2: Audio core module"
status: completed
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Audio core module

## Overview

`src/lib/audio.js`: the one place that owns the AudioContext, the gesture
unlock, lazy buffer decoding, and the two persisted preferences. Everything
later in the plan calls into it and nothing else touches Web Audio.

## Requirements

- Functional: read/write independent music and SFX preferences; unlock the context on the first user gesture anywhere in the document; play a named one-shot; expose the music buffer to Phase 5.
- Non-functional: client-only (never imported by anything under `src/app/api/`); individual function parameters per CLAUDE.md; every localStorage access wrapped in try/catch; no throw ever escapes into a caller; no network request before the first gesture.

## Architecture

Module-level singletons — one `AudioContext`, one `Map` of decoded buffers.
Mirrors `src/lib/theme.js` in shape: exported storage keys, `getStored*` /
`setStored*` pairs with try/catch, no UI imports.

```
                       ┌──────────────────────────┐
  first pointerdown ──►│ unlockAudio()            │
  or keydown (once)    │  new AudioContext()      │
                       │  ctx.resume()            │
                       │  notify subscribers      │
                       └───────────┬──────────────┘
                                   │
        playSound('pin') ──────────┼──────► loadBuffer() ─► fetch ─► decodeAudioData ─► Map
                                   │                                          │
                                   └──────► BufferSource ─► Gain(0.4) ─► destination
```

Preference reads are cheap and synchronous, so `playSound` checks the SFX
preference itself — callers never have to.

### Public surface

```js
export const MUSIC_STORAGE_KEY = 'vngeoguessr_music';
export const SFX_STORAGE_KEY = 'vngeoguessr_sfx';

export function getStoredMusicEnabled();          // boolean, default true
export function setStoredMusicEnabled(enabled);   // void
export function getStoredSfxEnabled();            // boolean, default true
export function setStoredSfxEnabled(enabled);     // void

export function unlockAudio();                    // idempotent; call from a gesture
export function watchUnlock(onUnlock);            // returns an unsubscribe fn
export function isUnlocked();                     // boolean
export function getAudioContext();                // AudioContext | null

export async function playSound(name, volume);    // fire-and-forget one-shot
export async function loadAudioBuffer(url);       // shared decode+cache, used by music
```

`watchUnlock` exists because the music player (Phase 5) mounts before the first
gesture and must start the loop the moment the context opens.

Defaults are `true` for both (D2). Storage encodes `'on'` / `'off'`; anything
else, including a read that throws, resolves to the default — the same
fallback-to-default posture `theme.js` takes for private browsing.

### Sound table

```js
const SOUNDS = {
  click: '/audio/click.mp3',
  pin: '/audio/pin.mp3',
  submit: '/audio/submit.mp3',
  great: '/audio/great.mp3',
  good: '/audio/good.mp3',
  poor: '/audio/poor.mp3',
  next: '/audio/next.mp3',
  skip: '/audio/skip.mp3',
  error: '/audio/error.mp3',
};
export const SFX_VOLUME = 0.4;
export const MUSIC_VOLUME = 0.15;
```

## Related Code Files

- Create: `src/lib/audio.js`
- Create: `tests/audio.test.js`

## Implementation Steps

1. Write the storage-key constants and the four preference helpers, each guarding `typeof window === 'undefined'` and wrapping localStorage in try/catch with a comment naming the private-browsing case — the same comment discipline `theme.js` uses.
2. Write `unlockAudio()`: create the context lazily (`window.AudioContext || window.webkitAudioContext`), call `resume()` when suspended, mark unlocked, notify subscribers. Idempotent and safe to call from any handler.
3. Register the one-shot document listener inside the module on first import: `pointerdown` and `keydown`, both `{ once: true, capture: true }`, both calling `unlockAudio()` then removing the other. Guard on `typeof document === 'undefined'` so an accidental server import is inert rather than fatal.
4. Write `loadAudioBuffer(url)`: return the cached buffer, otherwise `fetch` → `arrayBuffer` → `decodeAudioData`, cache and return. In-flight promises are cached too, so two simultaneous plays of the same sound decode once.
5. Write `playSound(name, volume)`: bail on unknown name, locked context, or SFX disabled; build `BufferSource → GainNode → destination`; `start()`. Wrap the whole body in try/catch with a comment stating that a missing file must not break gameplay.
6. Write `watchUnlock` / `isUnlocked` / `getAudioContext` for Phase 5.
7. Write `tests/audio.test.js` following `tests/username.test.js`'s plain-vitest style: stub `globalThis.localStorage` per case and cover — default true when unset; `'off'` reads false; `'on'` reads true; a garbage value reads the default; a getter that throws reads the default; a setter that throws does not propagate; set→get round-trips. Do not test Web Audio itself: jsdom has no real implementation and a mock would assert the mock.
8. Run `npm test`.

## Todo

- [x] `src/lib/audio.js` created with the surface above
- [x] Gesture unlock listener registered once, server-safe
- [x] Buffer cache dedupes in-flight decodes
- [x] `tests/audio.test.js` covers the preference helpers including both throw paths
- [x] `npm test` green

## Success Criteria

- [x] `npm test` passes with the new file
- [x] No import of `src/lib/audio.js` from any server module (`src/app/api/**`, `src/lib/pano-*.js`, `src/lib/session.js`)
- [x] Importing the module in a Node context (no `document`) does not throw
- [x] Calling `playSound` before unlock is a silent no-op and issues no network request
- [x] Preferences round-trip through localStorage and fall back to `true` on every failure path

## Risk Assessment

- **`decodeAudioData` rejects on a corrupt or 404 file.** Signal: a sound is silent, console shows a decode error. Response: the try/catch already contains it; the cache must not store a rejected promise or the sound stays broken for the session — delete the entry on failure.
- **The unlock listener fires on a gesture that is not meant to make sound** (e.g. dismissing the username modal). That is intended: unlocking is not playing.
- **Server import by accident.** Signal: a build error, or `document is not defined` at runtime. Response: the `typeof document` guard makes it inert, and Phase 6's check catches the import. `CLAUDE.md`'s client-safety rule already names this class of bug.
- **jsdom lacks AudioContext**, so unit tests cannot cover playback. Accepted: playback is verified manually in Phase 6. Testing a mock of the Web Audio API proves nothing.
