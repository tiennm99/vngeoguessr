import { booleanPointInPolygon, point } from '@turf/turf';
import { REGION_BOUNDARIES } from '../data/boundaries/index.js';
import { getRegion, isRegion, provinceOf } from './regions.js';

// Which region a point on the map falls in. Server-only: it loads every
// boundary polygon, which is too much to ship to the browser and is only
// needed once a guess is in. The game uses it to tell a player who missed by
// kilometres whether they at least had the right province -- a gradient the
// scoring ladder, which stops at one kilometre, does not provide.

const DISTRICTS = Object.values(REGION_BOUNDARIES).filter(
  (feature) => feature.properties.level === 'district'
);
const PROVINCES = Object.values(REGION_BOUNDARIES).filter(
  (feature) => feature.properties.level === 'province'
);

/** True when a point lies inside a boundary's bounding box. Cheap pre-filter. */
function inBbox(feature, lat, lng) {
  const bbox = feature.properties.bbox;
  if (!bbox) return true;
  const [west, south, east, north] = bbox;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

/** The first feature in a list whose polygon contains the point, or null. */
function containing(features, lat, lng) {
  const p = point([lng, lat]);
  for (const feature of features) {
    if (!inBbox(feature, lat, lng)) continue;
    if (booleanPointInPolygon(p, feature)) return feature.properties.code;
  }
  return null;
}

/**
 * The narrowest known region containing a point: a district where one is
 * mapped, otherwise a province, otherwise null (outside every covered area).
 * @param {number} lat
 * @param {number} lng
 * @returns {string|null} Region code.
 */
export function locateRegion(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return containing(DISTRICTS, lat, lng) ?? containing(PROVINCES, lat, lng);
}

/**
 * How a guess relates to the answer's region.
 * @param {string|null} guessedCode Region the guess landed in, from locateRegion.
 * @param {string} answerCode District (or province) the panorama sits in.
 * @returns {'district'|'province'|'none'} The deepest level the two share.
 */
export function regionHit(guessedCode, answerCode) {
  if (!guessedCode || !isRegion(guessedCode) || !isRegion(answerCode)) return 'none';
  if (guessedCode === answerCode && getRegion(answerCode).level === 'district') return 'district';
  const guessedProvince = provinceOf(guessedCode);
  return guessedProvince && guessedProvince === provinceOf(answerCode) ? 'province' : 'none';
}
