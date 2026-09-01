"use client";

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const HINT_STORAGE_KEY = 'vngeoguessr_hint_seen';

/**
 * One-time how-to-play banner over the game screen. All other instruction
 * lives on the homepage, so a player who arrives by shared link would
 * otherwise get a panorama with no hint that it drags or that the map takes
 * a click. Shown until dismissed or until the first guess is placed --
 * placing a pin proves the hint has been understood.
 * @param {Object} props
 * @param {boolean} props.hasGuess True once a guess pin exists this round.
 * @param {boolean} props.mapExpanded True while the phone minimap covers the
 *   screen. The banner yields then: the expanded panel's own controls live in
 *   a z-clamped stacking context the banner would otherwise paint over.
 */
export default function FirstRoundHint({ hasGuess, mapExpanded }) {
  const [visible, setVisible] = useState(false);

  // Read in an effect: localStorage does not exist on the server, and the
  // banner appearing a frame late beats a hydration mismatch.
  useEffect(() => {
    if (!localStorage.getItem(HINT_STORAGE_KEY)) setVisible(true);
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(HINT_STORAGE_KEY, '1');
  };

  // Placing a pin proves the hint has been understood. State must flip too,
  // not just render-hide on `hasGuess`: the next round clears the guess, and
  // an already-understood banner must not come back.
  useEffect(() => {
    if (hasGuess) {
      setVisible(false);
      localStorage.setItem(HINT_STORAGE_KEY, '1');
    }
  }, [hasGuess]);

  if (!visible || hasGuess) return null;

  return (
    <div
      role="note"
      aria-label="How to play"
      className={`absolute left-1/2 top-3 z-[700] w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-card/95 py-2 pl-4 pr-2 text-sm text-foreground shadow-lg backdrop-blur animate-fade-in-up ${
        mapExpanded ? 'hidden lg:flex' : 'flex'
      }`}
    >
      <span>
        Drag to look around · {' '}
        <span className="lg:hidden">Tap the minimap</span>
        <span className="hidden lg:inline">Click the map</span>
        {' '}to drop your guess · Submit
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss the how-to-play hint"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
