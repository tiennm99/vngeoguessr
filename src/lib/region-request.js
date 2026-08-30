// Region parsing shared by the API routes.
//
// One place, because four routes accept a region and each of them lowercasing
// or defaulting slightly differently is how a typo becomes a leaderboard key
// nobody reads.

import { getRegion, isRegion, isPlayable, regionPath, COUNTRY_CODE } from './regions.js';

/**
 * A 400-shaped failure a route can return directly.
 * @param {string} message What the caller got wrong.
 * @returns {{ok: false, status: number, error: string}} Failure.
 */
function reject(message) {
  return { ok: false, status: 400, error: message };
}

/**
 * Resolve the region a request is asking about.
 *
 * Accepts `region` and falls back to `city`, which is what every existing link
 * and bookmark still sends.
 * @param {URLSearchParams} searchParams Query parameters.
 * @param {boolean} required False to allow no region at all, meaning the country.
 * @returns {{ok: true, code: string}|{ok: false, status: number, error: string}}
 */
export function resolveRegion(searchParams, required) {
  // `||` not `??`: URLSearchParams.get returns '' for a present-but-empty
  // parameter, so `?region=&city=HN` must fall through to the city rather than
  // resolve to an empty region.
  const raw = searchParams.get('region') || searchParams.get('city');

  if (!raw) {
    if (required) return reject('Missing region parameter');
    // An absent region has always meant the whole country.
    return { ok: true, code: COUNTRY_CODE };
  }

  const code = raw.toUpperCase();
  if (!isRegion(code)) return reject(`Unknown region: ${raw}`);
  return { ok: true, code };
}

/**
 * Resolve a region that has to be playable.
 *
 * Rejects a region with no coverage rather than letting the draw fail deeper
 * in: Cu Chi has no boundary and two Da Nang districts have no imagery, and
 * "no panoramas left to try" is a worse answer than "that region has no
 * coverage".
 * @param {URLSearchParams} searchParams Query parameters.
 * @returns {{ok: true, code: string}|{ok: false, status: number, error: string}}
 */
export function resolvePlayableRegion(searchParams) {
  const resolved = resolveRegion(searchParams, true);
  if (!resolved.ok) return resolved;

  if (!isPlayable(resolved.code)) {
    return reject(`${getRegion(resolved.code).name} has no street view coverage yet`);
  }
  return resolved;
}

/**
 * The public description of a region, safe to send before a guess.
 *
 * Built only from what the player picked. The district the panorama actually
 * sits in is a secret until the guess is in -- naming it would collapse a
 * country-wide round to one district.
 * @param {string} code Region code the player chose.
 * @returns {{code: string, name: string, path: string[], level: string}} Description.
 */
export function publicRegion(code) {
  const region = getRegion(code);
  return {
    code,
    name: region.name,
    path: regionPath(code),
    level: region.level,
  };
}
