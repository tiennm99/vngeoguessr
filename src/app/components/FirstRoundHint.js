"use client";

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { getHintSeen, setHintSeen, watchHintSeen } from '../../lib/first-round-hint';
import { useStoredValue } from '../../lib/use-stored-value';

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
  // Treated as seen on the server, so the banner appears only once the
  // browser has said it has not been: a frame late beats a hydration mismatch.
  const seen = useStoredValue(getHintSeen, watchHintSeen, true);

  // Placing a pin proves the hint has been understood. Recorded, not just
  // render-hidden on `hasGuess`: the next round clears the guess, and an
  // already-understood banner must not come back.
  useEffect(() => {
    if (hasGuess) setHintSeen();
  }, [hasGuess]);

  if (seen || hasGuess) return null;

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
        onClick={setHintSeen}
        aria-label="Dismiss the how-to-play hint"
        className="pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card/95 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
