import { notFound } from 'next/navigation';
import GameClient from '../../components/GameClient';
import {
  allRegions,
  regionFromSlug,
  regionName,
  regionPath,
  regionSlug,
} from '../../../lib/regions';

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
 * Per-region title, so the tab, the history entry and the bookmark say the one
 * thing this URL shape exists to express. Without it all 85 prerendered pages
 * ship the root layout's single "VNGeoGuessr".
 *
 * Resolves through regionFromSlug and NOT getRegion: getRegion throws on an
 * unknown code, and metadata resolves before the page renders, so throwing here
 * would turn the honest 404 at /game/notaregion into a 500. An unresolved slug
 * falls through to the root metadata, and the page below still notFound()s.
 *
 * Naming the province ('Ba Dinh, Ha Noi') disambiguates the district names that
 * repeat across provinces. It reveals nothing: the answer is a panorama inside
 * the region, and the region is already in the URL.
 * @param {Object} props
 * @param {Promise<Object>} props.params Route params; a Promise in Next 16.
 * @returns {Promise<Object>} Metadata for this region, or {} to inherit.
 */
export async function generateMetadata({ params }) {
  const { region } = await params;
  const code = regionFromSlug(region);

  if (!code) return {};

  const name = regionName(code);
  // Narrowest first, country dropped: 'Ba Dinh, Ha Noi' rather than
  // 'Vietnam, Ha Noi, Ba Dinh' -- regionPath returns outermost first, so this
  // reverses it, and the country is the same word on all 85.
  const place = regionPath(code).slice(1).reverse().join(', ') || name;

  const title = `${name} — VNGeoGuessr`;
  const description = `Guess where you are in ${place}, from street view.`;
  return {
    title,
    description,
    // The share text links here, so this is the page a chat unfurls.
    openGraph: { title, description, url: `/game/${regionSlug(code)}` },
    twitter: { title, description },
  };
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
