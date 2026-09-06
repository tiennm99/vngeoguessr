"use client";

import { useEffect } from 'react';
import NotFoundPanel from '../../components/NotFoundPanel';
import { applyTheme, getStoredTheme, watchSystemTheme } from '../../../lib/theme';

// Reached when the [region] page rejects a code that is not in the tree --
// a typo'd or truncated shared link, mostly.
//
// Deliberately says nothing about which codes are valid: there are 85 of them
// and the picker is a better answer than a list.
export default function RegionNotFound() {
  // A thrown notFound() is served from Next's own error shell
  // (<html id="__next_error__">), so the root layout is rendered by React on
  // the CLIENT here. A script created that way never executes, whatever its
  // type -- see components/InlineScript.js, which marks it inert on the client
  // precisely because this is the one route where that happens. So the
  // pre-paint theme script cannot run, and a dark-theme visitor would get this
  // page in the light palette, permanently. Re-apply once mounted.
  //
  // This is why the file is a client component; nothing else here needs to be.
  // The cost is not a light flash but an empty one: the shell carries neither
  // this panel nor the layout, so nothing paints until hydration. Measured --
  // `curl /game/notaregion` returns the shell with no 'No such region' in it.
  // The app-wide src/app/not-found.js needs none of this: an unmatched path
  // really does prerender inside the root layout, footer and script included.
  //
  // Keeps following the OS afterwards, as ThemeToggle does elsewhere: a
  // 'system' visitor who flips appearance while sitting here would otherwise
  // hold the old palette until they navigate away.
  useEffect(() => {
    const reapply = () => applyTheme(getStoredTheme());
    reapply();
    return watchSystemTheme(reapply);
  }, []);

  return (
    <NotFoundPanel title="No such region" actionLabel="Pick a region" actionHref="/">
      That link points at a region that doesn&apos;t exist. It may have been
      mistyped or cut short.
    </NotFoundPanel>
  );
}
