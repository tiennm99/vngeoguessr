import { redirect } from 'next/navigation';
import { COUNTRY_CODE, regionSlug } from '../../lib/regions';

/**
 * One-line value read from a query string.
 *
 * URLSearchParams hands back an array when a key repeats, and an empty string
 * for a present-but-empty key. Both must read as "no value" so ?region= falls
 * through to the country rather than redirecting to a broken `/game/`.
 * @param {string|string[]|undefined} value Raw search-param value.
 * @returns {string} The value, or '' when there is not a usable one.
 */
function firstValue(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw : '';
}

/**
 * The old game URL, kept alive for every link and bookmark still in the wild.
 *
 * The region lives in the path now (/game/{slug}), so this reads the legacy
 * query and redirects. `region` wins over `location`, matching how the client
 * used to resolve a URL carrying both.
 *
 * Redirecting from here rather than through next.config.mjs `redirects()` is
 * deliberate: a config redirect forwards the original query string to the
 * destination, so a visitor would land on `/game/tphcm?region=TPHCM` and keep
 * the dead param forever. Building the destination here also applies the
 * lowercase URL convention in the same hop, so a legacy `?region=HN` reaches
 * `/game/hn` directly rather than through a second redirect.
 *
 * A region-less visit goes to the country. `resolveRegion()` has always read
 * an absent region that way; the old TPHCM fallback was never a stated default,
 * just where the query chain happened to end.
 */
export default async function GamePage({ searchParams }) {
  // searchParams is a Promise in Next 16.
  const query = await searchParams;
  const legacy = firstValue(query.region) || firstValue(query.location);
  const code = regionSlug(legacy || COUNTRY_CODE);

  // Encoded because `code` is whatever the query string carried -- this value
  // goes into a Location header unvalidated. A raw CRLF makes Node throw
  // (a 500 instead of the honest 404 below), and a raw '../' would be
  // normalised by the browser into a different path entirely. A real region
  // code round-trips through encodeURIComponent untouched, which
  // tests/regions.test.js asserts, so this costs nothing on the happy path.
  //
  // An unknown legacy code lands on /game/{slug}, which 404s there. That is
  // the honest answer -- it was never a playable link.
  redirect(`/game/${encodeURIComponent(code)}`);
}
