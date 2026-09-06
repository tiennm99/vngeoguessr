"use client";

import { useEffect } from 'react';
import NotFoundPanel from '../../components/NotFoundPanel';
import { applyTheme, getStoredTheme } from '../../../lib/theme';

// Reached when the [region] page rejects a code that is not in the tree --
// a typo'd or truncated shared link, mostly.
//
// Deliberately says nothing about which codes are valid: there are 85 of them
// and the picker is a better answer than a list.
export default function RegionNotFound() {
  // A thrown notFound() is served from Next's own error shell
  // (<html id="__next_error__">), which does not carry the pre-paint theme
  // script the root layout puts in <head> -- so a dark-theme visitor would get
  // this page in the light palette, permanently. Re-apply once mounted.
  //
  // This is why the file is a client component; nothing else here needs to be.
  // The cost is a light flash before hydration on a page that is already rare.
  // The app-wide src/app/not-found.js needs none of this: an unmatched path
  // prerenders inside the root layout, where the script does run.
  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  return (
    <NotFoundPanel title="No such region" actionLabel="Pick a region" actionHref="/">
      That link points at a region that doesn&apos;t exist. It may have been
      mistyped or cut short.
    </NotFoundPanel>
  );
}
