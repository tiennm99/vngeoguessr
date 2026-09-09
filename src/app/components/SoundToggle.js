"use client";

import { useEffect, useState } from 'react';
import { Music, Volume2, VolumeX } from 'lucide-react';
import {
  getStoredMusicEnabled,
  getStoredSfxEnabled,
  setStoredMusicEnabled,
  setStoredSfxEnabled,
  unlockAudio,
  watchMusicPreference,
  watchSfxPreference,
} from '../../lib/audio';

/**
 * Music and sound-effect switches, styled as a sibling of ThemeToggle so the
 * header chrome reads as one system.
 *
 * The game header runs out of room below the `sm` breakpoint -- Back, the
 * region badges, ThemeToggle's three cells and the donate button already fill
 * a 360px viewport -- so it renders the compact variant there and the pair
 * above it. Both are mounted at once, one of them display:none, which is why
 * this subscribes to the preferences rather than reading them once: without
 * that, rotating a phone past the breakpoint revealed a control still showing
 * its mount-time state, and the first press on it went the wrong way.
 *
 * @param {string} className Extra classes for the caller's layout.
 * @param {boolean} compact True for the one-button mute-all variant.
 * @returns {JSX.Element} The control.
 */
export default function SoundToggle({ className = '', compact = false }) {
  // Seeded with the same defaults the server renders, so the first client
  // render matches the HTML and the effect below only ever corrects a player
  // who has actually chosen otherwise. No `mounted` gate: with a default of
  // on, gating would paint every load as muted and then flip.
  const [musicOn, setMusicOn] = useState(true);
  const [sfxOn, setSfxOn] = useState(true);

  useEffect(() => {
    setMusicOn(getStoredMusicEnabled());
    setSfxOn(getStoredSfxEnabled());
    const unwatchMusic = watchMusicPreference(setMusicOn);
    const unwatchSfx = watchSfxPreference(setSfxOn);
    return () => {
      unwatchMusic();
      unwatchSfx();
    };
  }, []);

  // A click here is a real user gesture, which is the one thing the audio
  // context needs -- so unmuting is audible immediately rather than on the
  // next interaction. The preference setters notify every mounted control,
  // including this one.
  const applyMusic = (enabled) => {
    unlockAudio();
    setStoredMusicEnabled(enabled);
  };

  const applySfx = (enabled) => {
    unlockAudio();
    setStoredSfxEnabled(enabled);
  };

  const groupClass =
    `inline-flex h-11 items-center rounded-lg border border-border bg-card ${className}`;

  const cellClass = (on) =>
    `flex h-11 w-11 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
      on
        ? 'bg-brand text-brand-foreground shadow-sm'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;

  if (compact) {
    // Anything audible counts as on, so one press always silences everything.
    const anyOn = musicOn || sfxOn;
    const Icon = anyOn ? Volume2 : VolumeX;
    return (
      <div role="group" aria-label="Sound" className={groupClass}>
        <button
          type="button"
          aria-pressed={anyOn}
          aria-label="Sound"
          title={anyOn ? 'Mute everything' : 'Unmute'}
          onClick={() => {
            applyMusic(!anyOn);
            applySfx(!anyOn);
          }}
          className={cellClass(anyOn)}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  const SfxIcon = sfxOn ? Volume2 : VolumeX;

  return (
    // A plain group of toggle buttons rather than an ARIA radiogroup, matching
    // ThemeToggle: aria-pressed carries the state without obliging roving
    // tabindex and arrow-key navigation.
    <div role="group" aria-label="Sound" className={groupClass}>
      <button
        type="button"
        aria-pressed={musicOn}
        aria-label="Music"
        title={musicOn ? 'Mute music' : 'Unmute music'}
        onClick={() => applyMusic(!musicOn)}
        className={cellClass(musicOn)}
      >
        <Music className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-pressed={sfxOn}
        aria-label="Sound effects"
        title={sfxOn ? 'Mute sound effects' : 'Unmute sound effects'}
        onClick={() => applySfx(!sfxOn)}
        className={cellClass(sfxOn)}
      >
        <SfxIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
