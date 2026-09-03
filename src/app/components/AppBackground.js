import Image from 'next/image';

// The key art behind every page. One fixed layer under the whole app rather
// than a background-image on each surface: next/image serves a resized
// AVIF/WebP of the 1536x1024 source instead of the 2.4MB PNG, and the art
// never scrolls, repeats, or repaints as pages change.
//
// `.vn-surface` -- the ground every page sits on -- is translucent over this,
// so the art reads through the gutters while text keeps its contrast. Panes
// that must stay opaque (the panorama surround, cards, the header) still
// cover it, which is why the game screen shows the art only around its edges.
export default function AppBackground() {
  return (
    // Decorative: the pages above say everything, so nothing here is announced.
    <div aria-hidden="true" className="fixed inset-0 z-(--z-backdrop) overflow-hidden">
      <Image
        src="/bg.png"
        alt=""
        fill
        // The first paint on every route, so it is not lazy-loaded behind the
        // content that sits on top of it.
        priority
        sizes="100vw"
        className="object-cover"
      />
    </div>
  );
}
