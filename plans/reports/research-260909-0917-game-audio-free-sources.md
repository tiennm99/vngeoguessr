# Research Report: Music & SFX for VNGeoGuessr from Free Sources

Conducted 2026-09-09 09:17 (+07). Scope: where to legally get free audio, which licenses are safe to ship, and how to wire audio into this Next.js 16 / React 19 codebase.

## Table of Contents
- [Executive Summary](#executive-summary)
- [Methodology](#methodology)
- [1. Source Catalogue & Licenses](#1-source-catalogue--licenses)
- [2. Licensing Pitfalls](#2-licensing-pitfalls)
- [3. Sound Design for This Game](#3-sound-design-for-this-game)
- [4. Technical Implementation](#4-technical-implementation)
- [5. Formats, Size, Delivery](#5-formats-size-delivery)
- [6. Recommendations](#6-recommendations)
- [7. Common Pitfalls](#7-common-pitfalls)
- [References](#references)
- [Unresolved Questions](#unresolved-questions)

## Executive Summary

Use **Kenney (CC0)** for all UI/SFX and **Pixabay Music** or a **CC0 OpenGameArt loop** for background music. Both allow commercial use with **no attribution**, which keeps `/credits` unchanged and avoids per-file license tracking. Avoid Incompetech/CC-BY unless you want a permanent credit obligation, and avoid Freesound's mixed pool unless you filter strictly to CC0.

Implementation: **no new dependency needed**. The requirement is ~8 one-shot SFX plus one optional music loop — a ~70-line `src/lib/audio.js` (Web Audio buffers + a first-gesture unlock) mirrors the existing `src/lib/theme.js` preference pattern and stays KISS. Howler.js (~9 KB gz) only pays for itself if you later need sprites, spatial audio, or fades; it does bundle autoplay-unlock and HTML5 fallback for free.

Hard constraint: **every browser blocks audio before a user gesture**. iOS Safari is strictest and offers no user opt-out. Since the game already starts from a region-picker click, unlock the `AudioContext` in that first click handler — no "tap to start" gate needed.

## Methodology
- Sources consulted: 5 web searches + repo inspection (`package.json`, `src/app/components/`, `src/lib/`, `src/app/credits/page.js`)
- Date range: MDN/Chrome autoplay docs (evergreen) through 2026 asset-library round-ups
- Search terms: free CC0 game music/SFX 2026; Pixabay content license commercial restrictions; Howler.js vs Web Audio in React/Next; browser autoplay unlock iOS Safari; opus/webm vs mp3 loop size

## 1. Source Catalogue & Licenses

| Source | License | Attribution | Best for | Risk |
|---|---|---|---|---|
| [Kenney](https://kenney.nl/assets?q=audio) | CC0 1.0 | No | UI clicks, interface beeps, 85-track *Music Jingles* pack | None. Top pick |
| [OpenGameArt](https://opengameart.org/) | Per-asset (filter CC0) | Depends | Ambient loops, game-specific music | Must check each asset |
| [Pixabay Music / SFX](https://pixabay.com/music/) | Pixabay Content License | No | Background music loops | Cannot resell standalone; license changed 2019 & 2023-04-17 |
| [Freesound](https://freesound.org/) | Per-sound: CC0 / CC-BY / CC-BY-NC | Depends | Field recordings, oddities | **Per-file** licenses; NC files unusable commercially |
| [Sonniss GDC Bundle](https://sonniss.com/gameaudiogdc) | Royalty-free commercial | No | Pro SFX (200 GB+) | Huge download; no standalone redistribution |
| [Incompetech](https://incompetech.com/music/royalty-free/) | CC BY | **Yes** | 2000+ tracks | Permanent credit line required |
| YouTube Audio Library | Mixed, some CC-BY | Depends | Music | Tied to YouTube ToS; weakest paper trail |

Bottom line: **CC0 first, Pixabay second, CC-BY only if the track is worth a credits entry.**

## 2. Licensing Pitfalls

1. **Per-file, not per-site.** Freesound and OpenGameArt host CC0, CC-BY and CC-BY-NC side by side. The site is not the license — the download page is.
2. **Pixabay has three license eras** (CC0 pre-2019-01-09, Pixabay License 2019 → 2023-04, Content License 2023-04-17 → now). Anything grabbed from an old blog mirror may not carry the terms you think. Download fresh, from Pixabay.
3. **"Free" != "redistributable as an asset."** Pixabay and Sonniss both forbid reselling/redistributing the file *as stock media*. Shipping it inside the game is fine; publishing `public/audio/` as a downloadable asset pack is not. This repo is public on GitHub, so the files will be browsable — CC0 sidesteps the question entirely.
4. **Keep a manifest.** Since licenses are per-file, commit `public/audio/SOURCES.md` mapping each file → download URL → license → author. Cheap insurance, ~15 lines.
5. **CC-BY obligations land on `/credits`.** `src/app/credits/page.js` already uses a card-per-source layout — a new "Audio" card is the natural home, next to the Mapillary CC-BY-SA card.

## 3. Sound Design for This Game

Events already available in `GameClient.js` (line refs from current `main`):

| Event | Hook | Suggested sound |
|---|---|---|
| Region picked / button press | `RegionPicker`, any `<Button onClick>` | short UI click (Kenney *Interface Sounds*) |
| Pin dropped on map | `handleMapClick` (:239) | soft "pop" / marker thud |
| Guess submitted | `handleSubmitGuess` (:260) | rising whoosh |
| Result reveal, tiered by score | `setResult` / `RoundResultDialog` | 3 variants: great / ok / poor (Kenney *Music Jingles*) |
| Score count-up | `src/lib/use-count-up.js` | ticking blip, throttled >= 60 ms — **easy to make obnoxious** |
| Next round | `handleNextRound` (:308) | soft transition swoosh |
| Skip | `handleSkipGuess` (:341) | neutral/negative blip |
| Load error | `handlePanoramaError` (:223) | low error tone |
| Menu / region select background | `/` and `/game/[region]` idle | ambient loop, **off during the round** |

Deliberate call: GeoGuessr-likes run **silent during play** — music competes with the "read the scene" task. Default music off or menu-only; default SFX on at ~0.4 gain.

## 4. Technical Implementation

### Autoplay reality
An `AudioContext` created before a user gesture starts `suspended`; you must call `resume()` inside a gesture handler. iOS Safari blocks all unmuted autoplay with **no user override**. This project's flow already begins with a click (region pick), so unlock there — no extra "tap to start" screen.

```
first user click ──► ctx.resume() ──► fetch + decode buffers (once) ──► play()
                          │
                          └── all later plays are free
```

### Recommended: thin module, no dependency

Mirrors the `theme.js` shape already in `src/lib/` (localStorage preference + try/catch, individual params per CLAUDE.md).

```js
// src/lib/audio.js — client-only. Web Audio buffers; unlocked on first gesture.
export const AUDIO_STORAGE_KEY = 'vngeoguessr_audio';

const SOUNDS = {
  click: '/audio/click.mp3',
  pin: '/audio/pin.mp3',
  submit: '/audio/submit.mp3',
  great: '/audio/great.mp3',
  poor: '/audio/poor.mp3',
};

let ctx = null;
const buffers = new Map();

/**
 * Read the stored on/off choice.
 * @returns {boolean} True when sound should play.
 */
export function getStoredAudioEnabled() {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(AUDIO_STORAGE_KEY) !== 'off';
  } catch {
    // Private browsing and blocked site data both throw here; sound on is a
    // fine answer when the choice cannot be read.
    return true;
  }
}

/**
 * Persist the on/off choice.
 * @param {boolean} enabled Whether sound should play.
 * @returns {void}
 */
export function setStoredAudioEnabled(enabled) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Not being able to remember the choice must not break changing it.
  }
}

/**
 * Open the audio context. Must be called from a real user gesture; safe to
 * call repeatedly.
 * @returns {void}
 */
export function unlockAudio() {
  if (typeof window === 'undefined') return;
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
}

async function loadBuffer(name) {
  if (buffers.has(name)) return buffers.get(name);
  const response = await fetch(SOUNDS[name]);
  const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
  buffers.set(name, buffer);
  return buffer;
}

/**
 * Fire-and-forget one-shot. Never throws into the caller.
 * @param {string} name Key in SOUNDS.
 * @param {number} volume Gain, 0 to 1.
 * @returns {Promise<void>}
 */
export async function playSound(name, volume = 0.4) {
  if (!ctx || !SOUNDS[name] || !getStoredAudioEnabled()) return;
  try {
    const source = ctx.createBufferSource();
    source.buffer = await loadBuffer(name);
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(ctx.destination);
    source.start();
  } catch {
    // A missing or undecodable file must not break gameplay.
  }
}
```

Wire-up: call `unlockAudio()` in the region-picker click, `playSound('pin')` in `handleMapClick`, and add a speaker toggle beside `ThemeToggle` in the game header.

### Alternative: Howler.js
`howler@2.x`, ~9 KB gz, wraps Web Audio + HTML5 Audio, handles the unlock, and supports **audio sprites** (all SFX in one file, one decode, minimal latency). Take it if you expect to grow past ~10 sounds, or want fades/ducking/spatial audio. `react-howler` is unnecessary — call Howler directly from handlers. Skip it for the current scope: the wrapper is bigger than the problem.

## 5. Formats, Size, Delivery

- **SFX: MP3, mono, 96–128 kbps.** Universal support; each file 5–20 KB. Multi-format is not worth it at this size.
- **Music loop: WebM/Opus with an MP3 fallback.** Opus @96 kbps matches or beats MP3 @128 kbps at ~75% the size (30 s loop: ~180 KB vs ~240 KB). Safari only decodes Opus-in-WebM from **18.4**; older Safari needs the MP3.
- **Gapless looping:** MP3 carries encoder padding and loops with an audible gap. For a seamless loop use Ogg/WebM-Opus, or decode into a Web Audio buffer and set `loop` / `loopStart` / `loopEnd`.
- **Delivery:** `public/audio/`, served by Next.js with long-lived caching. **Do not preload on page load** — fetch and decode lazily after unlock so audio never blocks first paint. Keep the SFX set under ~200 KB total, music under ~1 MB.

## 6. Recommendations

Order of work:
1. Pick assets: Kenney *Interface Sounds* + *Music Jingles* (CC0) for all SFX; one Pixabay or CC0 OpenGameArt ambient loop for the menu.
2. Commit `public/audio/SOURCES.md` (file → URL → license → author) alongside the files.
3. Add `src/lib/audio.js` per above, with vitest coverage for `getStoredAudioEnabled` / `setStoredAudioEnabled` including the localStorage-throws path — `src/lib/` changes require `npm test` per CLAUDE.md.
4. Unlock in the first click; wire the five highest-value events (click, pin, submit, result tier, next).
5. Add a mute toggle next to `ThemeToggle`; persist like the theme.
6. Music last, menu-only, default off. Ship SFX first and see whether music is even wanted.
7. Update `/credits` **only if** a chosen asset is CC-BY.

Deliberately out of scope unless asked: spatial audio, per-sound volume sliders, dynamic music layering, an audio-settings modal.

## 7. Common Pitfalls
- Creating a `new Audio()` per playback — leaks elements and adds latency. Reuse buffers (or one Howl per asset).
- Calling `resume()` outside a gesture handler — silently stays suspended, no error thrown.
- Firing the count-up tick every animation frame — unbearable. Throttle, or play a single sweep instead.
- Shipping a CC-BY-NC Freesound file. It is not commercial-usable, and "my game is free" does not reliably make the use non-commercial.
- Assuming a whole site shares one license (Freesound, OpenGameArt and Pixabay all mix eras and licenses).
- Loud defaults. Start SFX at ~0.4 gain; loud is the top reason players mute permanently.

## References
- [Kenney assets (CC0)](https://kenney.nl/assets?q=audio)
- [OpenGameArt](https://opengameart.org/)
- [Pixabay Music](https://pixabay.com/music/) · [Pixabay Terms](https://pixabay.com/service/terms/) · [Pixabay commercial risk profile](https://picdefense.io/resources/source-intel/pixabay/)
- [Freesound](https://freesound.org/) · [Sonniss GDC bundle](https://sonniss.com/gameaudiogdc) · [Incompetech](https://incompetech.com/music/royalty-free/)
- [Game asset licenses explained](https://app.cinevva.com/guides/game-asset-licenses) · [Free SFX & music for games 2026](https://app.cinevva.com/guides/free-sound-effects-music) · [25 free game audio libraries](https://gamineai.com/resources/25-free-game-sound-effects-music-libraries-updated-2026)
- [MDN: Autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay) · [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay) · [Unlock Web Audio in Safari](https://www.mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos)
- [MDN: Web Audio API best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) · [howler.js](https://howlerjs.com/) · [howler.js repo](https://github.com/goldfire/howler.js/)
- [MDN: Web audio codec guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs) · [Opus browser support](https://www.testmuai.com/learning-hub/opus-audio-codec-browser-support/)

## Unresolved Questions
1. Music during the round, or menu-only? Recommendation: menu-only, default off — but it is a product call.
2. Mute toggle as a single on/off (KISS), or split music/SFX?
3. Vietnamese-flavoured music (đàn tranh, bamboo flute) or neutral ambient? CC0 Vietnamese instrumentation is scarce — likely Pixabay, or generated.
4. Is committing ~1 MB of audio to this repo acceptable, or should it go to a CDN/blob store?
5. Any existing audio assets or a preferred composer not visible in the repo?
