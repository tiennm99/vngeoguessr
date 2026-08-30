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
// should derive from calculateScore rather than re-typing these thresholds.
export const SCORE_BANDS = [
  { maxMeters: 50, points: 5 },
  { maxMeters: 100, points: 4 },
  { maxMeters: 200, points: 3 },
  { maxMeters: 500, points: 2 },
  { maxMeters: 1000, points: 1 },
];

// Calculate score based on distance (0-5 points scale)
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
