// Search for the guess map: instant region matching over the generated tree
// plus street/place geocoding through the public Photon endpoint (OSM data,
// no API key). Selecting a result only pans the map -- nothing in here knows
// about panoramas or answers.
//
// Client-safe by construction: imports regions.js and nothing else. The walk
// test in tests/geo-search.test.js enforces that this module never grows a
// path to pano-index.js, pano-db.js, or the boundary barrel.

import { allRegions, getRegion, ancestorsOf, COUNTRY_CODE } from './regions.js';

export const PHOTON_ENDPOINT = 'https://photon.komoot.io/api';

// A free public geocoder under load stalls more often than it refuses; without
// a deadline a hung connection would never resolve and the UI would show
// neither results nor the unavailable row.
export const PHOTON_TIMEOUT_MS = 5000;

/**
 * Lowercase and strip Vietnamese diacritics so "Bình Thạnh" and "binh thanh"
 * compare equal. NFD splits base letters from combining marks; đ/Đ carry no
 * combining mark and need their own mapping.
 * @param {string} text Raw user input or region name.
 * @returns {string} Folded text.
 */
export function foldDiacritics(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

// Vietnamese admin prefixes players type but the tree's names omit:
// "quận 7" should hit "District 7", "huyện Củ Chi" should hit "Cu Chi".
const ADMIN_PREFIX = /^(?:quan|q\.?|huyen|h\.?|phuong|p\.?|district|thi xa|tx\.?|thanh pho|tp\.?|tinh)\s+/;

/**
 * Every searchable key for one region: the folded name, its space-stripped
 * form, and for "District N" names the Vietnamese aliases quan N / q N / qN.
 * @param {Object} region A node from the region tree.
 * @returns {string[]} Folded keys.
 */
export function regionSearchKeys(region) {
  const aliases = [foldDiacritics(region.name)];
  const districtNumber = aliases[0].match(/^district (\d+)$/);
  if (districtNumber) {
    aliases.push(`quan ${districtNumber[1]}`, `q ${districtNumber[1]}`);
  }
  return [...new Set(aliases.flatMap((alias) => [alias, alias.replace(/ /g, '')]))];
}

// Built once: every province and district with somewhere to pan to, keyed for
// folded lookup. Unresolved leaves (no bbox and no center) are unsearchable
// because selecting them could not move the map.
const SEARCH_INDEX = allRegions()
  .map((code) => getRegion(code))
  .filter((region) => region.level !== 'country' && (region.bbox || region.center))
  .map((region) => ({ region, keys: regionSearchKeys(region) }));

/**
 * Regions under a root whose name matches the query. Diacritic-insensitive,
 * tolerant of quận/huyện/district prefixes, provinces ranked before
 * districts and prefix matches before mid-word ones.
 * @param {string} query Raw user input.
 * @param {string} rootCode Region being played; only its descendants match.
 * @returns {Object[]} Up to 5 normalized results (kind 'region').
 */
export function searchRegions(query, rootCode) {
  const folded = foldDiacritics(query.trim());
  if (folded.length < 2) return [];
  // Match the query as typed and with its admin prefix stripped, keeping the
  // better rank: "quận 7" hits the "quan 7" alias exactly, while the stripped
  // "củ chi" is what reaches the "cu chi" key behind "huyện Củ Chi".
  const needles = [...new Set([folded, folded.replace(ADMIN_PREFIX, '')])]
    .filter((needle) => needle.length >= 2);

  const scored = [];
  for (const { region, keys } of SEARCH_INDEX) {
    if (region.code === rootCode) continue;
    if (rootCode !== COUNTRY_CODE && !ancestorsOf(region.code).includes(rootCode)) continue;
    let best = Infinity;
    for (const key of keys) {
      for (const needle of needles) {
        if (key === needle) best = Math.min(best, 0);
        else if (key.startsWith(needle)) best = Math.min(best, 1);
        else if (key.includes(needle)) best = Math.min(best, 2);
      }
    }
    if (best === Infinity) continue;
    scored.push({ region, rank: (region.level === 'province' ? 0 : 3) + best });
  }

  return scored
    .sort((a, b) => a.rank - b.rank || a.region.name.localeCompare(b.region.name))
    .slice(0, 5)
    .map(({ region }) => ({
      kind: 'region',
      label: region.name,
      sublabel: region.parent && region.parent !== COUNTRY_CODE
        ? getRegion(region.parent).name
        : 'Province',
      center: region.center ?? null,
      bbox: region.bbox ?? null,
    }));
}

/**
 * One Photon GeoJSON feature as a normalized search result, or null when it
 * carries no usable coordinates.
 * @param {Object} feature A feature from Photon's response.
 * @returns {Object|null} Normalized result (kind 'place').
 */
export function parsePhotonFeature(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const properties = feature.properties ?? {};
  const label = properties.name || properties.street;
  if (!label) return null;
  const sublabel = [...new Set(
    [properties.street, properties.district, properties.city, properties.state]
      .filter((part) => part && part !== label)
  )].join(', ');
  // Photon's extent is [west, north, east, south]; the repo's bbox convention
  // everywhere else is [west, south, east, north].
  const extent = properties.extent;
  const bbox = Array.isArray(extent) && extent.length === 4
    ? [extent[0], extent[3], extent[2], extent[1]]
    : null;
  return {
    kind: 'place',
    label,
    sublabel,
    center: [coordinates[1], coordinates[0]],
    bbox,
  };
}

/**
 * Street/place search against the public Photon geocoder.
 * @param {string} query Raw user input.
 * @param {number[]|null} bbox [west, south, east, north] to restrict results to.
 * @param {number} limit Maximum results to request.
 * @param {AbortSignal|null} signal Cancels a stale request; that abort
 *   rethrows so the caller can tell "superseded" from "unavailable".
 * @returns {Promise<Object[]|null>} Normalized results, or null when the
 *   geocoder is unreachable, stalls past the deadline, or answers non-OK.
 */
export async function searchPhoton(query, bbox, limit, signal) {
  const url = new URL(PHOTON_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  if (bbox) url.searchParams.set('bbox', bbox.join(','));
  const deadline = AbortSignal.timeout(PHOTON_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (data.features ?? []).map(parsePhotonFeature).filter(Boolean);
  } catch (error) {
    // Only the caller's own abort is "superseded"; a timeout abort and every
    // network failure read as the geocoder being unavailable.
    if (signal?.aborted) throw error;
    return null;
  }
}
