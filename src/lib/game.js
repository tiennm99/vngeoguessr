import * as turf from '@turf/turf';

// Calculate distance between two coordinates in meters using Turf
export function calculateDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  try {
    const from = turf.point([lon1, lat1]);
    const to = turf.point([lon2, lat2]);
    const distanceKm = turf.distance(from, to, { units: 'kilometers' });

    // Convert to meters and round
    return Math.round(distanceKm * 1000);
  } catch (error) {
    console.error('Error calculating distance with Turf:', error);
    throw new Error(`Failed to calculate distance: ${error.message}`);
  }
}

// Distance ceiling in meters -> points. The single BASE ladder; anything
// that bands a result (colors, labels, the scoring table on the home page)
// should derive from it or from calculateScore rather than re-typing the
// thresholds.
//
// These are the DISTRICT-scale bands. A round played over a province or the
// whole country is scored against the same ladder stretched by the region's
// size -- see bandsForBbox -- because 1km is a bullseye across 331,000 km2
// and a guaranteed miss would make every country round score zero.
// Frozen because bandsForBbox hands this exact array out by identity, on the
// server and in client renders alike: one in-place sort or mutation anywhere
// would silently rewrite the base ladder for the whole process.
export const SCORE_BANDS = Object.freeze([
  Object.freeze({ maxMeters: 50, points: 5 }),
  Object.freeze({ maxMeters: 100, points: 4 }),
  Object.freeze({ maxMeters: 200, points: 3 }),
  Object.freeze({ maxMeters: 500, points: 2 }),
  Object.freeze({ maxMeters: 1000, points: 1 }),
]);

// The bbox diagonal of a typical district. A region this size or smaller keeps
// the base ladder unchanged; larger regions stretch it proportionally.
export const REFERENCE_DIAGONAL_METERS = 10_000;

/**
 * The scoring ladder stretched to a region of the given size.
 * @param {number} diagonalMeters The region's bbox diagonal in meters.
 * @returns {{maxMeters: number, points: number}[]} Scaled bands.
 */
export function bandsForDiagonal(diagonalMeters) {
  // A non-numeric diagonal falls back to the base ladder rather than
  // producing NaN thresholds that serialize to null.
  const factor = Number.isFinite(diagonalMeters)
    ? Math.max(1, diagonalMeters / REFERENCE_DIAGONAL_METERS)
    : 1;
  return SCORE_BANDS.map((band) => ({
    maxMeters: Math.round(band.maxMeters * factor),
    points: band.points,
  }));
}

/**
 * The scoring ladder for a region, from its bbox.
 * @param {number[]|null|undefined} bbox [west, south, east, north], or absent.
 * @returns {{maxMeters: number, points: number}[]} Scaled bands; the base
 *   district ladder when the region has no bbox.
 */
export function bandsForBbox(bbox) {
  if (!bbox) return SCORE_BANDS;
  const diagonal = calculateDistance(bbox[1], bbox[0], bbox[3], bbox[2]);
  return bandsForDiagonal(diagonal);
}

// Calculate score based on distance (0-5 points scale)
export function calculateScore(distance, bands = SCORE_BANDS) {
  const band = bands.find((entry) => distance <= entry.maxMeters);
  return band ? band.points : 0;
}

// Format distance for display
export function formatDistance(distance) {
  if (distance < 1000) {
    return `${distance}m`;
  } else {
    return `${(distance / 1000).toFixed(2)}km`;
  }
}
