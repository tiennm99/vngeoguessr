"use client";

/**
 * An inline script that runs during HTML parsing, before the first paint.
 *
 * A Client Component on purpose, though it has no interactivity: the type
 * swap below has to be evaluated in the BROWSER to do anything. A Server
 * Component evaluates it once on the server, bakes `text/javascript` into the
 * RSC payload, and the warning fires anyway -- measured, not assumed.
 *
 * The `type` swap is the documented cure (Next's own
 * "preventing flash before hydration" guide) for React's dev warning
 * "Encountered a script tag while rendering React component". React warns
 * whenever it *client*-renders a script whose type is executable, because a
 * script created through the DOM never runs -- silently, which is the real
 * hazard. Marking it `text/plain` on the client says "inert on purpose": React
 * skips the warning, and nothing is lost, because a client-rendered script
 * would not have executed anyway.
 *
 * On the server it stays `text/javascript`, so a hard load still runs it
 * before paint. `suppressHydrationWarning` covers the type differing between
 * the two.
 * @param {string} html The script body.
 * @returns {JSX.Element} The script element.
 */
export default function InlineScript({ html }) {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
