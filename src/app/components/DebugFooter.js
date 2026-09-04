"use client";

import { useEffect, useRef, useState } from 'react';

// Where the sha links to. Hard-coded rather than derived from a git remote:
// the remote is a build-machine detail, the public repo is a product fact.
const REPO_URL = 'https://github.com/tiennm99/vngeoguessr';

// Footer credit plus build stamp, rendered on every page: who made this, and
// which commit is this deployment?
//
// An in-flow strip at the bottom of the body's sticky-footer column, not a
// fixed overlay: it owns its own row (and the home-indicator safe area), so
// it never overlaps the game's panorama, map, or action bar, and no layer
// needs a z-index to win over it. The sha label opens that commit on GitHub;
// the button beside it copies the FULL sha (the label shows the short form).
//
// Height is --footer-h (36px) rather than the 44px touch floor: this strip is
// a band taken out of the game's non-scrolling surface, where in landscape
// 44px is a sixth of the vertical budget. 36px clears the 24px WCAG 2.2 target
// minimum, and both targets stay wide.
export default function DebugFooter() {
  const sha = process.env.NEXT_PUBLIC_COMMIT_SHA || 'unknown';
  const hasSha = sha !== 'unknown';
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

  // Every footer target shares this: --footer-h tall so the tap area comes
  // from padding rather than the deliberately tiny label. Horizontal padding
  // is per-target, so the sha and its copy button can sit tight together
  // while each still spans the full strip height.
  const targetClass =
    'flex min-h-(--footer-h) items-center justify-center rounded-md text-[11px] leading-none text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring';

  return (
    <footer className="flex shrink-0 items-center justify-center gap-1 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <a
        href="https://miti99.com"
        target="_blank"
        rel="noopener noreferrer"
        className={`${targetClass} px-3`}
      >
        Made by <span className="underline underline-offset-2 mx-1">miti99</span> with{' '}
        <span aria-hidden="true" className="ml-1">❤️</span>
        <span className="sr-only">love</span>
      </a>
      <span className="text-[11px] leading-none text-muted-foreground" aria-hidden="true">·</span>
      {/* The sha and its copy button read as one control, so they sit in a
          gapless pair rather than as two separate items in the footer row. */}
      <span className="flex items-center">
        {hasSha ? (
          <a
            href={`${REPO_URL}/commit/${sha}`}
            target="_blank"
            rel="noopener noreferrer"
            title={sha}
            aria-label={`View build commit ${sha} on GitHub`}
            className={`${targetClass} pl-2 pr-1 font-mono underline underline-offset-2`}
          >
            {sha.slice(0, 7)}
          </a>
        ) : (
          <span className={`${targetClass} px-2 font-mono`}>{sha}</span>
        )}
        {/* aria-live announces the ✅ swap; the emoji itself is decorative, so
            the label carries the meaning either way. */}
        {hasSha && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? 'Build commit copied' : 'Copy build commit'}
            aria-live="polite"
            title="Copy full commit sha"
            className={`${targetClass} cursor-pointer select-none pl-1 pr-2 active:text-foreground`}
          >
            <span aria-hidden="true">{copied ? '✅' : '🗐'}</span>
          </button>
        )}
      </span>
    </footer>
  );
}
