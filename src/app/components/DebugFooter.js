"use client";

import { useEffect, useRef, useState } from 'react';

// Footer credit plus build stamp, rendered on every page: who made this, and
// which commit is this deployment?
//
// An in-flow strip at the bottom of the body's sticky-footer column, not a
// fixed overlay: it owns its own row (and the home-indicator safe area), so
// it never overlaps the game's panorama, map, or action bar, and no layer
// needs a z-index to win over it. Clicking the sha copies the FULL value
// (the label shows the short form).
//
// Height is --footer-h (36px) rather than the 44px touch floor: this strip is
// a band taken out of the game's non-scrolling surface, where in landscape
// 44px is a sixth of the vertical budget. 36px clears the 24px WCAG 2.2 target
// minimum, and both targets stay wide.
export default function DebugFooter() {
  const sha = process.env.NEXT_PUBLIC_COMMIT_SHA || 'unknown';
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(resetTimerRef.current), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sha);
      setCopied(true);
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      // Clipboard access can be denied (insecure context, permissions); the
      // label is still readable, so failing quietly beats an alert.
      console.error('Could not copy commit sha:', error);
    }
  };

  return (
    <footer className="flex shrink-0 items-center justify-center gap-2 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <a
        href="https://miti99.com"
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-(--footer-h) items-center rounded-md px-3 text-[11px] leading-none text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        Made by <span className="underline underline-offset-2 mx-1">miti99</span> with{' '}
        <span aria-hidden="true" className="ml-1">❤️</span>
        <span className="sr-only">love</span>
      </a>
      <span className="text-[11px] leading-none text-muted-foreground" aria-hidden="true">·</span>
      {/* The visual is deliberately tiny, so the tap target comes from
          padding: --footer-h tall, well past the label's own box. min-w in ch
          keeps the width stable when the 7-char sha swaps for the 7-char
          'copied!', so the click never shifts the thing being clicked.
          aria-live announces that swap to screen readers. */}
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy build commit"
        aria-live="polite"
        title={sha}
        className="flex min-h-(--footer-h) min-w-[9ch] cursor-pointer select-none items-center justify-center rounded-md px-3 font-mono text-[11px] leading-none text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground active:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        {copied ? 'copied!' : sha.slice(0, 7)}
      </button>
    </footer>
  );
}
