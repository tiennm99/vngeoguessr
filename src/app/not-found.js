import NotFoundPanel from './components/NotFoundPanel';

// The one place the per-region title argument had not been applied: a tab, a
// history entry and a bookmark for a dead link all read "VNGeoGuessr" without
// this. A not-found route CAN export metadata -- verified in the prerendered
// _not-found.html, not assumed. The region 404 still cannot: it is served from
// Next's error shell, which carries no metadata at all.
export const metadata = {
  title: 'Page not found — VNGeoGuessr',
};

// The app-wide 404, for any path no route claims. Without it Next serves its
// stock page, which paints unstyled text over the full-bleed background with
// no footer and no way out -- its own full-height wrapper pushes the footer
// off screen.
//
// The action says "Go to VNGeoGuessr" rather than naming a start: this 404
// catches links from outside the app -- a mistyped path, a stale search result
// -- and that visitor has never seen one.
export default function NotFound() {
  return (
    <NotFoundPanel title="Page not found" actionLabel="Go to VNGeoGuessr" actionHref="/">
      There&apos;s nothing at this address. It may have moved, or the link may
      have been mistyped.
    </NotFoundPanel>
  );
}
