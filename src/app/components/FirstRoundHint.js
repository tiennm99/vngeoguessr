"use client";

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const HINT_STORAGE_KEY = 'vngeoguessr_hint_seen';

/**
 * One-time how-to-play banner, rendered into the panorama pane's top row. All
 * other instruction lives on the homepage, so a player who arrives by shared
 * link would otherwise get a panorama with no hint that it drags or that the
 * map takes a click. Shown until dismissed or until the first guess is placed
 * -- placing a pin proves the hint has been understood.
 *
 * A flow item, deliberately: as a free-floating overlay it was centred on the
 * whole game box, which put it over the guess map's search field on desktop
 * and over the Mapillary attribution on phones. Sharing a flex row with the
 * credit is what makes both collisions unrepresentable, so this component owns
 * no position, no transform and no z-index.
 * @param {Object} props
 * @param {boolean} props.hasGuess True once a guess pin exists this round.
 */
export default function FirstRoundHint({ hasGuess }) {
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
    // role="status" rather than "note": the banner appears after hydration, so
    // a screen-reader user already past the header would never meet a note.
    <div
      role="status"
      aria-label="How to play"
      className="flex items-start justify-start gap-2 animate-fade-in-up"
    >
      <span className="pointer-events-auto rounded-xl border border-border bg-card/95 px-3 py-2 text-sm text-foreground shadow-lg backdrop-blur">
        Drag to look around · {' '}
        <span className="lg:hidden">Tap the minimap</span>
        <span className="hidden lg:inline">Click the map</span>
        {' '}to drop your guess · Submit
      </span>
      {/* size-11, not size-8: a missed tap on the old 32px target started a
          panorama drag instead of dismissing the hint. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss the how-to-play hint"
        className="pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card/95 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
