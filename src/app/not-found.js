import NotFoundPanel from './components/NotFoundPanel';

// The app-wide 404, for any path no route claims. Without it Next serves its
// stock page, which paints unstyled text over the full-bleed background with
// no footer and no way out -- its own full-height wrapper pushes the footer
// off screen.
export default function NotFound() {
  return (
    <NotFoundPanel title="Page not found" actionLabel="Go to the start" actionHref="/">
      There&apos;s nothing at this address. It may have moved, or the link may
      have been mistyped.
    </NotFoundPanel>
  );
}
