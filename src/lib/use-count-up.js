"use client";

import { useEffect, useState } from 'react';

const DURATION_MS = 700;
const FRAME_MS = 1000 / 60;

/**
 * Count a number up from zero, easing out.
 *
 * The result is the emotional peak of a round, and a number that lands
 * instantly reads as a fact rather than a reward. Counting it up is what makes
 * the score feel earned. Written by hand rather than pulled from an animation
 * library: this is the only animated number in the app.
 *
 * @param {number} value Final value to land on.
 * @param {boolean} active False holds the counter at zero, so a reveal can wait
 *   its turn in the sequence.
 * @returns {number} The value to render this frame.
 */
export function useCountUp(value, active) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!active) {
      setShown(0);
      return;
    }

    // Nothing to count towards, and no reason to spin a timer for it.
    if (!value) {
      setShown(value);
      return;
    }

    // prefers-reduced-motion means show the answer, not a slower animation.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setShown(value);
      return;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(1, elapsed / DURATION_MS);
      // Ease out cubic: fast at first, settling onto the final number.
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(value * eased));
      if (progress >= 1) clearInterval(timer);
    }, FRAME_MS);

    return () => clearInterval(timer);
  }, [value, active]);

  return shown;
}
