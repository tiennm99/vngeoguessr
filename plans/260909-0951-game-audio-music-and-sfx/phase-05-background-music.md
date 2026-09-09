---
title: "Phase 5: Background music"
status: completed
priority: P1
effort: "4h"
dependencies: [2, 3]
---

# Phase 5: Background music

## Overview

A gapless ambient loop that starts on the first gesture, plays on the menu and
through the round, and survives client navigation between them.

## Requirements

- Functional: music starts as soon as the context unlocks (default on); loops seamlessly; keeps playing across `/` → `/game/[region]` → back with no restart; stops immediately when muted and resumes from silence when unmuted.
- Non-functional: mounted once per document; no music file fetched before the first gesture; MP3 fallback for Safari below 18.4; total added JS well under 2 KB.

## Architecture

A `MusicPlayer` client component with no rendered output, mounted in
`RootLayout` (D4). Route changes in the App Router re-render the page subtree,
not the layout — anything mounted per-page would tear down and restart the loop
on every navigation, which is exactly the artefact this avoids.

```
RootLayout (server)
 └── <MusicPlayer />        client, renders null, mounted once per document
      ├── watchUnlock()  ──► start when the context opens
      ├── watchMusicPreference() ──► start / stop on toggle
      └── AudioBufferSourceNode(loop=true) ─► Gain(0.15) ─► destination
```

**Why a decoded buffer and not `<audio loop>`:** MP3 carries encoder padding at
both ends, so an `<audio>` element loops with an audible gap. `decodeAudioData`
drops the container framing and `AudioBufferSourceNode.loop` returns to sample
zero, so the seam is sample-accurate (D6).

**Format pick:** probe once with a throwaway element —

```js
// Safari decoded Opus-in-WebM only from 18.4; the MP3 is for everything older.
const canWebm = document.createElement('audio')
  .canPlayType('audio/webm; codecs="opus"') !== '';
const src = canWebm ? '/audio/music.webm' : '/audio/music.mp3';
```

**Stop/start semantics.** An `AudioBufferSourceNode` is single-use: once
stopped it cannot restart. Unmuting therefore builds a fresh source from the
cached buffer (the buffer itself is decoded once and kept). Muting stops the
node and drops the reference. No pause/resume — the loop restarts from the top,
which is inaudible on an ambient bed and far simpler than tracking offsets.

## Related Code Files

- Create: `src/app/components/MusicPlayer.js`
- Modify: `src/app/layout.js` — mount `<MusicPlayer />` inside `<body>`, alongside `<AppBackground />`
- Modify: `src/lib/audio.js` only if `loadAudioBuffer` needs to be reachable from the component (it is already exported in Phase 2)

## Implementation Steps

1. Write `MusicPlayer` as a `"use client"` component returning `null`. All state lives in refs — a music node is not render state and re-rendering the root layout for it would be wasteful.
2. On mount, subscribe to `watchUnlock` and `watchMusicPreference`; unsubscribe on unmount. Do not read preferences during render (hydration).
3. `startMusic()`: bail if already playing, locked, or the preference is off. `await loadAudioBuffer(src)`, then build `BufferSource(loop = true) → Gain(MUSIC_VOLUME) → destination` and `start()`. Guard against the mount unmounting mid-await.
4. `stopMusic()`: `stop()` the node, disconnect, clear the ref. Never touch the cached buffer.
5. Wire the two subscriptions: unlock → `startMusic()`; preference change → `startMusic()` or `stopMusic()`.
6. Mount in `src/app/layout.js` next to `<AppBackground />`. Note in a comment that its position is load-bearing: inside `<body>` but outside the `flex min-h-dvh flex-col` wrapper, so a null-rendering component can never become a flex row — the same reasoning the existing comment gives for keeping Radix portals out of that column.
7. Test navigation: home → region → play a round → Back → home. The loop must not restart at any step. Confirm by ear on a track with an obvious phrase start.
8. Test the mute path: mute mid-loop (silence is immediate), reload (still muted), unmute (loop restarts from the top).
9. Confirm in DevTools Network that neither music file is requested until the first click.

## Todo

- [x] `MusicPlayer` written, renders null, refs only
- [x] WebM/Opus with MP3 fallback via `canPlayType`
- [x] Mounted in the root layout with a comment on why it lives there
- [ ] Starts on unlock, stops/starts on preference change
- [ ] Loop seam verified by ear
- [x] No music fetch before the first gesture

## Success Criteria

- [ ] Music begins within a second of the first click and never before it
- [ ] `/` → `/game/[region]` → Back plays continuously with no restart or gap
- [ ] The loop point is inaudible
- [ ] Mute stops it instantly; the choice survives a reload; unmute restarts it
- [ ] SFX remain audible with music muted, and vice versa
- [ ] Safari (or a `canPlayType` stub) takes the MP3 path and plays
- [ ] No console errors on mount, unmount, or rapid mute/unmute clicking

> **Boxes left open need ears or a live browser.** The code is written and the
> automated gates pass; these are the claims only a manual pass can make.
> Phase 6 lists them as one checklist.

## Risk Assessment

- **Rapid mute/unmute clicking creates overlapping nodes**, and the loop plays twice against itself. Signal: the bed thickens and phases. Response: `startMusic` returns early when a node ref exists; `stopMusic` clears it synchronously before any await.
- **The component unmounts while `loadAudioBuffer` is in flight**, and `start()` runs on a dead component. Signal: music plays with nothing controlling it. Response: an `alive` ref checked after the await, cleared in the cleanup.
- **The loop is audibly not seamless** despite Phase 1's check. Signal: a click or a breath at the seam. Response: trim to a zero crossing, or set `loopStart`/`loopEnd` inside the sustained body of the track.
- **In-round music turns out to be a mistake** (it competes with the panorama — the reason most GeoGuessr-likes play silent). Signal: it is distracting after two rounds, or testers reach for the mute. Response: flip the music default to off, or scope playback to the menu — both are small, localized changes, and this phase is deliberately last so that call is cheap.
- **React 19 Strict Mode double-mounts in dev**, starting two loops locally. Signal: doubled audio in dev only. Response: the cleanup must genuinely stop the node; if it does, Strict Mode is a correctness test that passes, not a bug to work around.
