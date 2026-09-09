---
title: "Phase 3: Sound controls"
status: completed
priority: P1
effort: "3h"
dependencies: [2]
---

# Phase 3: Sound controls

## Overview

A `SoundToggle` component that sits beside `ThemeToggle` in every header,
switching music and SFX independently, persisted and hydration-safe.

## Requirements

- Functional: two toggles (music, SFX), each reflecting and writing its stored preference; a click on either is itself a user gesture, so it unlocks audio; changes take effect immediately, including stopping music mid-playback.
- Non-functional: no hydration mismatch; keyboard reachable with visible focus; 44px minimum touch targets; no horizontal overflow at 320px.

## Architecture

Visually and structurally a sibling of `ThemeToggle`: an `inline-flex` group of
icon buttons in a bordered `bg-card` pill, `aria-pressed` carrying state,
`role="group"` rather than a radiogroup (the same reasoning `ThemeToggle`
documents — claiming a role without honouring roving tabindex is worse than not
claiming it).

```
sm and up:            below sm (game header only):
┌──────┬──────┐       ┌──────┐
│ ♪    │ 🔊   │       │ 🔊   │   one button, mutes/unmutes both
└──────┴──────┘       └──────┘
 music   sfx
```

Icons from Lucide, matching the existing icon language: `Music` / `Music2` for
music on/off, `Volume2` / `VolumeX` for SFX on/off.

**Hydration.** Stored preferences exist only on the client. Follow
`ThemeToggle` exactly: render the server-side default on first paint, set
`mounted` in an effect, and only then reflect the real value. Unlike the theme
there is no flash-of-wrong-colour problem, so no inline pre-paint script is
needed.

**Cross-component sync.** Two headers never render at once, but the music
player (Phase 5) must react to the music toggle. Export a tiny subscription
from `src/lib/audio.js` — `watchMusicPreference(onChange)` — and have
`setStoredMusicEnabled` notify it. Simpler than React context for two consumers,
and it keeps the preference logic in one module.

### D8: small-screen collapse

The game header already carries Back + region/session badges + `ThemeToggle`
(132px) + Beer. Two more 44px buttons overflow a 360px viewport. So
`SoundToggle` takes a `compact` prop: `compact` renders one button reflecting
"anything on / everything off" and toggling both. The game header passes
`compact` below `sm` via a CSS-only pair (`sm:hidden` / `hidden sm:inline-flex`)
rather than a resize listener — no JS, no hydration risk.

Home, credits and debug headers have room; they always get the split pair.

## Related Code Files

- Create: `src/app/components/SoundToggle.js`
- Modify: `src/lib/audio.js` — add `watchMusicPreference` and notify from `setStoredMusicEnabled`
- Modify: `src/app/page.js` (:106 area) — add beside `ThemeToggle`
- Modify: `src/app/components/GameClient.js` (:431 area) — add the compact/split pair
- Modify: `src/app/credits/page.js` (:44 area) — add beside `ThemeToggle`
- Modify: `src/app/debug/layout.js` (:37 area) — add beside `ThemeToggle`

## Implementation Steps

1. Add `watchMusicPreference(onChange)` to `src/lib/audio.js`: a listener set, notified by `setStoredMusicEnabled`, returning an unsubscribe function. Same shape as `watchSystemTheme` in `theme.js`.
2. Write `SoundToggle({ className, compact })` as a `"use client"` component. State: `musicOn`, `sfxOn`, `mounted`. Read both preferences in a mount effect.
3. Split mode: two buttons. Each `onClick` calls `unlockAudio()`, flips local state, and writes the preference. Give each a real `aria-label` and `title` that names the current action ("Mute music" / "Unmute music").
4. Compact mode: one button. On = anything on. Click turns both off when anything is on; turns both on otherwise. Label reflects it ("Mute all sound" / "Unmute").
5. Style from `ThemeToggle`: `h-11`, `w-11` cells, `rounded-lg border border-border bg-card`, selected state `bg-brand text-brand-foreground shadow-sm`, unselected `text-muted-foreground hover:bg-muted`, `focus-visible:ring-[3px] focus-visible:ring-ring/50`. Do not fork the styling — if it drifts, the two controls look like different systems.
6. Mount in all four headers. In `GameClient.js` render `<SoundToggle className="sm:hidden" compact />` and `<SoundToggle className="hidden sm:inline-flex" />`.
7. Check 320px and 360px widths on the game screen in DevTools. If it still overflows, the next lever is the Beer button's label, not the sound control.

## Todo

- [x] `watchMusicPreference` added and wired into `setStoredMusicEnabled`
- [x] `SoundToggle` written, split and compact modes
- [x] Mounted in home, game, credits and debug headers
- [x] 320px / 360px overflow checked on the game screen
- [ ] Keyboard tab order and focus rings verified

## Success Criteria

- [x] Both toggles reflect stored state after reload
- [ ] No React hydration warning in the console on any page
- [ ] Turning music off stops it immediately, not at the end of the loop
- [ ] Turning SFX off silences the next interaction sound
- [ ] Every button reachable by keyboard with a visible focus ring, `aria-pressed` correct
- [x] No horizontal overflow at 320px and 360px on `/game/[region]`
- [ ] The control is visually indistinguishable in style from `ThemeToggle`

> **Boxes left open need ears or a live browser.** The code is written and the
> automated gates pass; these are the claims only a manual pass can make.
> Phase 6 lists them as one checklist.

## Risk Assessment

- **Hydration mismatch** if stored state is read during render. Signal: React warning, or the icon flickers. Response: the `mounted` gate from `ThemeToggle`; treat any warning as a blocker.
- **The compact/split pair double-renders in the DOM** (both exist, one hidden). Two elements with the same `aria-label` are announced twice by some screen readers. Response: the hidden one is `display: none` via Tailwind's `hidden`, which removes it from the accessibility tree. Verify once with a screen reader or the accessibility inspector.
- **Header still overflows.** Signal: horizontal scrollbar at 320px. Response: escalate to trimming the Beer button before touching the sound control — donation is not a per-round interaction.
- **`aria-pressed` semantics are wrong for a mute button** if the label says "Mute" while pressed means "on". Response: label the *state* ("Music on"/"Music off") and let `aria-pressed` carry it, or label the *action* without `aria-pressed`. Pick one; do not mix.
