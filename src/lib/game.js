import * as turf from '@turf/turf';

// Cities enum-like structure.
//
// bbox comes from src/data/boundaries/<code>.geojson, which holds each city's
// pre-2025-merger extent. Vietnam merged its provinces in mid-2025, so today's
// official Ho Chi Minh City covers 36,566 km2 and reaches Vung Tau; the legacy
// outline is the area people actually mean by the city.
//
// center stays the recognisable city centre rather than the polygon's centroid,
// which for an irregular outline can land somewhere no one associates with the
// place. The map fits the bbox anyway.
//
// There is no Mapillary query window any more: locations come from the prebuilt
// index in src/data/panos/, not from searching an area.
export const CITIES = {
  HN: {
    code: 'HN',
    name: 'Ha Noi',
    center: [21.0285, 105.8542],
    bbox: [105.28896, 20.56452, 106.02004, 21.38542],
    enabled: true
  },
  DN: {
    code: 'DN',
    name: 'Da Nang',
    center: [16.0544, 108.2022],
    bbox: [107.81854, 15.91799, 108.33864, 16.2255],
    enabled: true
  },
  TPHCM: {
    code: 'TPHCM',
    name: 'Ho Chi Minh',
    center: [10.8231, 106.6297],
    bbox: [106.46356, 10.35828, 107.02758, 10.92934],
    enabled: true
  },
  DL: {
    code: 'DL',
    name: 'Da Lat',
    center: [11.9404, 108.4583],
    bbox: [108.31521, 11.80798, 108.5944, 12.00855],
    enabled: true
  },
  DH: {
    code: 'DH',
    name: 'Duc Hoa (Long An)',
    center: [10.8888, 106.3825],
    bbox: [106.27082, 10.7409, 106.53287, 11.02578],
    enabled: true
  }
};

// Helper functions for backward compatibility
export const cityCenters = Object.fromEntries(
  Object.values(CITIES).map(city => [city.code, city.center])
);

export const cityNames = Object.fromEntries(
  Object.values(CITIES).map(city => [city.code, city.name])
);


export const cityBboxes = Object.fromEntries(
  Object.values(CITIES).map(city => [city.code, city.bbox])
);

// Cities list for UI components (only enabled cities)
export const cities = Object.values(CITIES)
  .filter(city => city.enabled)
  .map(city => ({
    code: city.code,
    name: city.name.toUpperCase()
  }));

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

// Calculate score based on distance (0-5 points scale)
export function calculateScore(distance) {
  if (distance <= 50) return 5;
  if (distance <= 100) return 4;
  if (distance <= 200) return 3;
  if (distance <= 500) return 2;
  if (distance <= 1000) return 1;
  return 0;
}

// Format distance for display
export function formatDistance(distance) {
  if (distance < 1000) {
    return `${distance}m`;
  } else {
    return `${(distance / 1000).toFixed(2)}km`;
  }
}


// Get or set username from localStorage
export function getUsername() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('vngeoguessr_username');
}

export function setUsername(username) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('vngeoguessr_username', username);
}

// Get result message based on score
export function getResultMessage(score, distance) {
  if (score > 4) return "Excellent! Outstanding guess!";
  if (score > 2) return "Good job! Nice work!";
  if (score > 0) return "Not bad! Keep trying!";
  return "Nice try! Better luck next time!";
}

// Get distance color for leaderboard display
export function getDistanceColor(distance) {
  if (distance <= 50) return 'text-green-700 dark:text-green-300';
  if (distance <= 100) return 'text-blue-700 dark:text-blue-300';
  if (distance <= 200) return 'text-yellow-700 dark:text-yellow-300';
  if (distance <= 500) return 'text-orange-700 dark:text-orange-300';
  return 'text-red-700 dark:text-red-300';
}
