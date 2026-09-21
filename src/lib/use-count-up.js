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
 * Only the animation frames live in state. Inactive, zero and reduced-motion
 * are derived on the way out, so nothing has to be reset in an effect.
 *
 * @param {number} value Final value to land on.
 * @param {boolean} active False holds the counter at zero, so a reveal can wait
 *   its turn in the sequence.
 * @returns {number} The value to render this frame.
 */
export function useCountUp(value, active) {
  // The frames of the current animation, keyed by what they animate towards
  // so a stale run for a previous value is never shown against a new one.
  const [frame, setFrame] = useState({ target: null, shown: 0 });

  useEffect(() => {
    if (!active || !value || prefersReducedMotion()) return undefined;

    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(1, elapsed / DURATION_MS);
      // Ease out cubic: fast at first, settling onto the final number.
      const eased = 1 - Math.pow(1 - progress, 3);
      setFrame({ target: value, shown: Math.round(value * eased) });
      if (progress >= 1) clearInterval(timer);
    }, FRAME_MS);

    return () => clearInterval(timer);
  }, [value, active]);

  if (!active) return 0;
  // prefers-reduced-motion means show the answer, not a slower animation.
  if (!value || prefersReducedMotion()) return value;
  return frame.target === value ? frame.shown : 0;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
