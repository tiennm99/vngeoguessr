"use client";

import Link from 'next/link';

/**
 * A link into a game that lets the home page intercept a plain click (to ask
 * for a name first). Modified clicks (new tab, new window) keep native
 * behaviour: the deep-linked game page can name the player itself, so
 * hijacking the gesture would cost more than the prompt is worth.
 * @param {Object} props
 * @param {string} props.href Game URL.
 * @param {(href: string) => boolean} [props.onPlayClick] Returning true cancels
 *   the navigation (the caller resumes it itself).
 */
export default function PlayLink({ href, onPlayClick, ...linkProps }) {
  return (
    <Link
      href={href}
      {...linkProps}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (onPlayClick?.(href)) e.preventDefault();
      }}
    />
  );
}
