# Audio sources and licenses

Every file in this directory is **CC0 1.0 Universal** (public domain
dedication). No attribution is legally required; the Credits page names the
authors anyway, as it does for every other asset in this project.

Licenses on asset sites are per file, not per site. This table is the audit
trail: one row per shipped file, naming the exact upstream source. Add a row
before adding a file.

Downloaded 2026-09-09.

## Sound effects

Kenney's packs ship as 44.1 kHz stereo Ogg Vorbis. Each file here is
RMS-normalised to −18 dBFS, limited to −1 dBFS peak, downmixed to mono and
encoded as 112 kbps MP3 — the raw sources span 16 dB, which would leave the
click inaudible beside the submit sound.

| File | Role | Upstream file | Pack | Author | License | Source |
|------|------|---------------|------|--------|---------|--------|
| `click.mp3` | Navigational buttons | `click2.ogg` | UI Audio | Kenney | CC0 1.0 | https://kenney.nl/assets/ui-audio |
| `pin.mp3` | Guess marker dropped | `drop_002.ogg` | Interface Sounds | Kenney | CC0 1.0 | https://kenney.nl/assets/interface-sounds |
| `submit.mp3` | Guess submitted | `maximize_002.ogg` | Interface Sounds | Kenney | CC0 1.0 | https://kenney.nl/assets/interface-sounds |
| `skip.mp3` | Round skipped | `minimize_002.ogg` | Interface Sounds | Kenney | CC0 1.0 | https://kenney.nl/assets/interface-sounds |
| `next.mp3` | Next round | `open_001.ogg` | Interface Sounds | Kenney | CC0 1.0 | https://kenney.nl/assets/interface-sounds |
| `error.mp3` | Panorama or submit failure | `error_004.ogg` | Interface Sounds | Kenney | CC0 1.0 | https://kenney.nl/assets/interface-sounds |
| `great.mp3` | Result, 4-5 points | `jingles_PIZZI02.ogg` | Music Jingles | Kenney | CC0 1.0 | https://kenney.nl/assets/music-jingles |
| `good.mp3` | Result, 1-3 points | `jingles_PIZZI12.ogg` | Music Jingles | Kenney | CC0 1.0 | https://kenney.nl/assets/music-jingles |
| `poor.mp3` | Result, 0 points | `jingles_PIZZI14.ogg` | Music Jingles | Kenney | CC0 1.0 | https://kenney.nl/assets/music-jingles |

`submit.mp3` and `skip.mp3` are the same sound in opposite directions —
Kenney's `maximize_002` rises, `minimize_002` falls. Sending a guess and
abandoning one are mirror actions, so they get mirror sounds.

## Music

| File | Track | Author | License | Source |
|------|-------|--------|---------|--------|
| `music.webm` | Ambient Relaxing Loop | isaiah658 | CC0 1.0 | https://opengameart.org/content/ambient-relaxing-loop |
| `music.mp3` | Ambient Relaxing Loop | isaiah658 | CC0 1.0 | https://opengameart.org/content/ambient-relaxing-loop |

One 24.5-second loop, shipped twice: Opus in WebM for current browsers, MP3 for
Safari below 18.4, which cannot decode Opus in WebM. Both are encoded from the
upstream WAV with no level change — the app plays the bed at 0.15 gain.

The track was chosen on a measurement rather than a hunch: its first and last
250 ms sit within 0.5 dB of each other, so the loop point carries continuous
energy. The two longer OpenGameArt candidates that were also auditioned
(Contemplation, Daydream) fade in from and out to silence — 29 dB and 74 dB
apart across the seam — and would drop out audibly on every repeat.

**MP3 loop caveat:** MP3 carries encoder padding that `decodeAudioData` renders
as silence, so the fallback path can have a short gap at the loop point. Only
Safari below 18.4 takes that path.
