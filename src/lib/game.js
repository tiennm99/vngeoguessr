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

// Distance ceiling in meters -> points. The single scoring ladder; anything
// that bands a result (colors, labels, the scoring table on the home page)
// should derive from it or from calculateScore rather than re-typing the
// thresholds.
//
// One ladder for every region. A guess is graded on the same absolute
// precision whether the round was played over a district, a province or the
// whole country, so a point means the same thing on every board.
// Frozen because this exact array is read on the server and in client renders
// alike: one in-place sort or mutation anywhere would silently rewrite the
// ladder for the whole process.
export const SCORE_BANDS = Object.freeze([
  Object.freeze({ maxMeters: 50, points: 5 }),
  Object.freeze({ maxMeters: 100, points: 4 }),
  Object.freeze({ maxMeters: 200, points: 3 }),
  Object.freeze({ maxMeters: 500, points: 2 }),
  Object.freeze({ maxMeters: 1000, points: 1 }),
]);

/**
 * Points for a guess, from its distance to the target.
 * @param {number} distance Distance in meters.
 * @returns {number} Points on the 0-5 scale.
 */
export function calculateScore(distance) {
  const band = SCORE_BANDS.find((entry) => distance <= entry.maxMeters);
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
