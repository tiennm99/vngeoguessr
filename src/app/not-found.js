import NotFoundPanel from './components/NotFoundPanel';

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
