"use client";

import { useEffect, useRef, useState } from 'react';

// Footer credit plus build stamp, rendered on every page: who made this, and
// which commit is this deployment?
//
// Bottom-center, styled as a link; clicking copies the FULL sha (the label
// shows the short form). z-40 keeps it under dialogs (z-50) and under the
// game screen's action bar and map (z-500+), so on a phone mid-round it ducks
// behind the controls. The wrapper stays click-transparent; only the button
// itself takes the pointer.
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
    <div className="pointer-events-none fixed inset-x-0 bottom-[env(safe-area-inset-bottom)] z-40 flex items-center justify-center gap-1">
      <a
        href="https://miti99.com"
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto flex min-h-11 items-center rounded-md px-2 text-[11px] leading-none text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        Made by <span className="underline underline-offset-2 mx-1">miti99</span> with{' '}
        <span aria-hidden="true" className="ml-1">❤️</span>
        <span className="sr-only">love</span>
      </a>
      <span className="text-[11px] leading-none text-muted-foreground" aria-hidden="true">·</span>
      {/* The visual is deliberately tiny, so the tap target comes from
          padding: ~44px tall, well past the label's own box. min-w in ch
          keeps the width stable when the 7-char sha swaps for the 7-char
          'copied!', so the click never shifts the thing being clicked.
          aria-live announces that swap to screen readers. */}
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy build commit"
        aria-live="polite"
        title={sha}
        className="pointer-events-auto flex min-h-11 min-w-[9ch] cursor-pointer select-none items-center justify-center rounded-md px-3 font-mono text-[11px] leading-none text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground active:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        {copied ? 'copied!' : sha.slice(0, 7)}
      </button>
    </div>
  );
}
