// Assign panoramas to the district they sit in.
//
// Shared by scripts/assign-pano-districts.mjs (which repartitions the indexes
// already on disk) and scripts/build-pano-index.mjs (which does it inline on a
// fresh build). One copy, because the fallback rule below is the kind of detail
// that drifts silently when it lives in two places.

import { readFileSync } from 'node:fs';
import * as turf from '@turf/turf';
import { REGIONS } from '../../src/data/regions/index.js';
import { BOUNDARY_DIR } from './paths.mjs';

// Distinct-place resolution. The index is thinned at ~33m, so a single street
// corridor yields dozens of entries and a raw count overstates how many
// different places a district actually offers by roughly 30x. Counting
// occupied cells at ~1.1km is a far better proxy for "would a player recognise
// this as somewhere new".
export const CELL_DEG = 0.01;

// A node needs both enough panoramas and enough distinct places to be worth
// playing. The panorama floor is not cosmetic: fetchCityPanorama retries up to
// MAX_ATTEMPTS (3) with a different candidate each time, so a district with
// fewer than that throws instead of degrading when an image has been deleted
// upstream.
export const MIN_PANOS = 3;
export const MIN_CELLS = 3;
// Below this a district is playable but repetitive -- a couple of streets seen
// from many angles. The UI labels it rather than hiding it.
export const THIN_CELLS = 10;

/**
 * Load one region's boundary polygon.
 * @param {string} code Region code.
 * @returns {Object} GeoJSON feature.
 */
export function loadBoundary(code) {
  const region = REGIONS[code];
  if (!region) throw new Error(`Unknown region: ${code}`);
  // The owning province comes from the tree, not from the code's shape. Da Lat
  // is 'DL' under 'LD' and Duc Hoa is 'DH' under 'LA' -- both kept their bare
  // codes so their leaderboard history stays attached, so neither carries its
  // parent as a prefix the way 'TPHCM-Q7' does.
  const province = region.level === 'province' ? code : region.parent;
  return JSON.parse(
    readFileSync(
      `${BOUNDARY_DIR}/${province.toLowerCase()}/${code.toLowerCase()}.json`,
      'utf8'
    )
  );
}

/**
 * A polygon's outline as plain LineString features.
 *
 * turf.pointToLineDistance takes a LineString and nothing else, while
 * polygonToLine returns a FeatureCollection for a MultiPolygon and a
 * MultiLineString for a polygon with holes. Flatten both cases once, here.
 * @param {Object} boundary GeoJSON polygon feature.
 * @returns {Object[]} LineString features.
 */
export function outlineSegments(boundary) {
  const converted = turf.polygonToLine(boundary);
  const features = converted.type === 'FeatureCollection' ? converted.features : [converted];
  return features.flatMap((feature) =>
    feature.geometry.type === 'MultiLineString'
      ? feature.geometry.coordinates.map((coords) => turf.lineString(coords))
      : [feature]
  );
}

/**
 * Prepare a province's district polygons for repeated point tests.
 *
 * Each entry carries its bbox so the caller can reject most points without
 * running point-in-polygon at all: against a detailed outline that test is the
 * expensive part, and Ha Noi alone asks it 226k times.
 * @param {string[]} leafCodes District codes to include.
 * @returns {Array<{code: string, boundary: Object, bbox: number[]}>} Candidates.
 */
export function prepareDistricts(leafCodes) {
  return leafCodes.map((code) => {
    const boundary = loadBoundary(code);
    // The outline as line work, so a stranded point can be ranked by its real
    // distance to each district rather than to a bbox centre. Normalised all
    // the way down to plain LineStrings: polygonToLine hands back a
    // FeatureCollection for a MultiPolygon and a MultiLineString for a polygon
    // with holes, and pointToLineDistance accepts neither.
    return {
      code,
      boundary,
      lines: outlineSegments(boundary),
      bbox: boundary.properties.bbox ?? turf.bbox(boundary),
    };
  });
}

/**
 * Which district a point falls in.
 * @param {Object} point {lat, lng}.
 * @param {Array} districts Output of prepareDistricts.
 * @returns {string|null} District code, or null when no polygon contains it.
 */
export function districtFor(point, districts) {
  const candidates = districts.filter(
    (d) =>
      point.lng >= d.bbox[0] &&
      point.lng <= d.bbox[2] &&
      point.lat >= d.bbox[1] &&
      point.lat <= d.bbox[3]
  );
  if (candidates.length === 0) return null;

  const turfPoint = turf.point([point.lng, point.lat]);
  for (const candidate of candidates) {
    if (turf.booleanPointInPolygon(turfPoint, candidate.boundary)) return candidate.code;
  }
  return null;
}

/**
 * Nearest district by outline, for a point that fell in a gap.
 *
 * District outlines are simplified independently, so shared borders do not tile
 * perfectly and a thin sliver between two neighbours belongs to neither. Such a
 * point is genuinely in one of them; assigning it is better than leaving it
 * province-only, which would quietly under-credit that district forever.
 *
 * Ranked by distance to the actual outline, not to a bbox centre. A bbox centre
 * is a poor proxy: a compact district's centre can beat a sprawling neighbour
 * whose edge is metres away, which measured up to 6km of misattribution in Ho
 * Chi Minh City. This fires on ~0.1% of points, so the accuracy is nearly free.
 * @param {Object} point {lat, lng}.
 * @param {Array} districts Output of prepareDistricts.
 * @returns {{code: string, km: number}|null} Nearest, or null with no districts.
 */
export function nearestDistrict(point, districts) {
  const turfPoint = turf.point([point.lng, point.lat]);
  let best = null;
  let bestKm = Infinity;
  for (const district of districts) {
    for (const line of district.lines) {
      const km = turf.pointToLineDistance(turfPoint, line, { units: 'kilometers' });
      if (km < bestKm) {
        bestKm = km;
        best = district.code;
      }
    }
  }
  return best === null ? null : { code: best, km: bestKm };
}

/**
 * Assign every panorama in a province to one of its districts.
 *
 * Two failure counts, because they mean different things:
 *   stranded    fell inside no district polygon and was placed by the nearest-
 *               outline fallback. This is the quality signal -- it rises when
 *               the leaf simplification tolerance is too loose.
 *   unassigned  could not be placed at all, i.e. the province has no district
 *               polygons. Structurally zero for the five real provinces, kept
 *               so the arithmetic below stays honest for a future one.
 * @param {Object[]} panos Entries with lat and lng.
 * @param {string[]} leafCodes District codes of the province.
 * @returns {{assignments, counts, cells, stranded, unassigned, worstStrandedKm}}
 */
export function assignPanos(panos, leafCodes) {
  const districts = prepareDistricts(leafCodes);
  const assignments = [];
  const counts = Object.fromEntries(leafCodes.map((code) => [code, 0]));
  const cellSets = Object.fromEntries(leafCodes.map((code) => [code, new Set()]));
  let stranded = 0;
  let unassigned = 0;
  let worstStrandedKm = 0;

  for (const pano of panos) {
    let code = districtFor(pano, districts);
    if (!code) {
      const nearest = nearestDistrict(pano, districts);
      if (nearest) {
        stranded++;
        worstStrandedKm = Math.max(worstStrandedKm, nearest.km);
        code = nearest.code;
      } else {
        unassigned++;
      }
    }
    assignments.push(code);
    if (code) {
      counts[code]++;
      cellSets[code].add(cellKey(pano));
    }
  }

  const cells = Object.fromEntries(
    Object.entries(cellSets).map(([code, set]) => [code, set.size])
  );
  return {
    assignments,
    counts,
    cells,
    stranded,
    unassigned,
    worstStrandedKm: Number(worstStrandedKm.toFixed(3)),
  };
}

/** Coarse cell a point occupies, for the distinct-place count. */
export function cellKey(point) {
  return `${Math.floor(point.lat / CELL_DEG)}:${Math.floor(point.lng / CELL_DEG)}`;
}

/**
 * Whether a node has enough coverage to be worth offering.
 * @param {number} panos Panorama count.
 * @param {number} cells Distinct cell count.
 * @returns {{playable: boolean, thin: boolean}} Verdict.
 */
export function coverageVerdict(panos, cells) {
  const playable = panos >= MIN_PANOS && cells >= MIN_CELLS;
  return { playable, thin: playable && cells < THIN_CELLS };
}
