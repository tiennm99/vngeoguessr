---
title: "Phase 1: Audio assets and licensing"
status: completed
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Audio assets and licensing

## Overview

Source, encode and commit every audio file the game will play, with a per-file
license manifest that proves each one is safe to ship.

## Requirements

- Functional: nine SFX files and one music loop exist at fixed paths under `public/audio/`, encoded for the web.
- Non-functional: every file is CC0 or Pixabay Content License (commercial use, no attribution required). SFX total <= 200 KB, music <= 1 MB. No file is CC-BY-NC.

## Architecture

Flat directory, one file per sound key, names matching the `SOUNDS` map that
Phase 2 defines. No sprite sheet — nine small files decode once and stay in a
`Map`, and sprites would buy latency we do not need at this count.

```
public/audio/
  click.mp3   pin.mp3    submit.mp3
  great.mp3   good.mp3   poor.mp3
  next.mp3    skip.mp3   error.mp3
  music.webm  music.mp3
  SOURCES.md
```

Music ships twice: `music.webm` (Opus, ~96 kbps) for everything modern, and
`music.mp3` (~128 kbps) for Safari below 18.4. Phase 5 picks between them with
`canPlayType`.

## Related Code Files

- Create: `public/audio/*.mp3`, `public/audio/music.webm`, `public/audio/SOURCES.md`
- Modify: `src/app/credits/page.js` — add an "Audio" card to the `LIBRARIES`-style card stack, listing each source with its license
- Modify: `.gitignore` — confirm nothing under `public/audio/` is excluded

## Implementation Steps

1. Pull SFX candidates from [Kenney](https://kenney.nl/assets?q=audio) — *Interface Sounds* and *UI Audio* for `click`/`pin`/`next`/`skip`/`error`, *Music Jingles* for `great`/`good`/`poor`. All CC0 1.0, no attribution.
2. Pull the music loop from [Pixabay Music](https://pixabay.com/music/) (filter: ambient, loopable, 60-120 s) or a CC0 OpenGameArt loop. Download from the source site directly — never a mirror; Pixabay's terms changed in 2019 and again 2023-04-17.
3. Audition each candidate. Reject anything abrasive, comedic, or longer than ~1.2 s for a one-shot.
4. Encode with ffmpeg (already used elsewhere in the toolchain? if not, any encoder is fine — these are one-off conversions, not a build step):
   - SFX: `ffmpeg -i in.ogg -ac 1 -b:a 112k out.mp3`
   - Music WebM: `ffmpeg -i in.wav -c:a libopus -b:a 96k music.webm`
   - Music MP3: `ffmpeg -i in.wav -b:a 128k music.mp3`
5. Trim leading/trailing silence on the SFX — latency the player hears as lag is usually just an unpadded head.
6. Verify the music loops seamlessly: play the decoded buffer with `loop = true` in a scratch page and listen across the seam. If it clicks, trim to a zero crossing or pick another track.
7. Write `public/audio/SOURCES.md`: one row per file — filename, title, author, source URL, license, download date.
8. Add the Credits card. CC0 requires no attribution, but every other asset in this repo is credited and audio should match.
9. Report the total byte size against the budget.

## Todo

- [x] Nine SFX sourced, auditioned, encoded to mono MP3
- [x] Music loop sourced, encoded to WebM/Opus + MP3, seam verified
- [x] `public/audio/SOURCES.md` written, one row per file
- [x] `/credits` Audio card added
- [x] Size budget checked and reported

## Success Criteria

- [x] Eleven audio files present at the exact paths above
- [x] Every row in `SOURCES.md` names a license that is CC0 or Pixabay Content License, with a working source URL
- [x] SFX total <= 200 KB; music files <= 1 MB combined
- [x] Music loops with no audible click or gap
- [x] `/credits` renders the Audio card without layout breakage in both themes

## Risk Assessment

- **A file's license is not what the listing page implied.** Freesound and OpenGameArt mix CC0, CC-BY and CC-BY-NC in one search result. Signal: the download page shows a license the manifest row cannot honestly record. Response: drop the file, pick another. Never "probably fine".
- **The music loop is subtly wrong for the game** — too busy, too melodic, fights the panorama. Signal: it is distracting on the second listen. Response: this is why Phase 5 is last; swapping `music.webm`/`music.mp3` needs no code change.
- **ffmpeg unavailable on this machine.** Signal: command not found. Response: source pre-encoded MP3/OGG and skip re-encoding; the size budget is the only thing at stake.
