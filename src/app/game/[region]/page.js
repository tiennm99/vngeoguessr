import { notFound } from 'next/navigation';
import GameClient from '../../components/GameClient';
import { allRegions, regionFromSlug, regionSlug } from '../../../lib/regions';

// Every region gets a prerendered page. The region tree is the only data this
// needs -- never pano-index.js or pano-db.js, which reach the exact panorama
// coordinates. See the boundary note at the top of lib/regions.js.
//
// Deliberately allRegions() and not playableRegions(): a real region with no
// imagery still renders, so the player gets the coverage message the API
// already writes ("... has no street view coverage yet") instead of a 404,
// which would be a worse answer than the one already there.
export async function generateStaticParams() {
  return allRegions().map((code) => ({ region: regionSlug(code) }));
}

/**
 * The game screen for one region.
 *
 * Validating here rather than in GameClient is what turns a typo'd URL into a
 * real 404. Without it an unknown code renders under the page's own fallback
 * label ('Vietnam') while the API resolves whatever it was handed.
 *
 * An unusual casing renders rather than redirecting to the canonical one --
 * see regionFromSlug for why.
 */
export default async function GameRegionPage({ params }) {
  // params is a Promise in Next 16; destructuring it synchronously is the
  // pre-16 shape and yields undefined here.
  const { region } = await params;
  const code = regionFromSlug(region);

  if (!code) notFound();

  // Keyed by region so a region-to-region navigation remounts rather than
  // handing the running game a new prop. GameClient initialises once behind an
  // `initialized` guard, so a prop change alone would leave the previous
  // region's round on screen. Nothing navigates that way today -- every path
  // out goes through the menu -- but a path segment makes prop-change-without-
  // unmount the normal App Router pattern, and this is one word.
  return <GameClient key={code} region={code} />;
}
