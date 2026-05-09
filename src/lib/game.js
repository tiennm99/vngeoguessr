import * as turf from '@turf/turf';

// Cities enum-like structure
export const CITIES = {
  HN: {
    code: 'HN',
    name: 'Ha Noi',
    center: [21.0285, 105.8542],
    bbox: [105.77, 20.96, 105.88, 21.05],
    mapillaryDelta: 0.003,
    enabled: true
  },
  DN: {
    code: 'DN',
    name: 'Da Nang',
    center: [16.0544, 108.2022],
    bbox: [108.17, 16, 108.25, 16.1],
    mapillaryDelta: 0.005,
    enabled: false
  },
  TPHCM: {
    code: 'TPHCM',
    name: 'Ho Chi Minh',
    center: [10.8231, 106.6297],
    bbox: [106.62, 10.71, 106.75, 10.83],
    mapillaryDelta: 0.005,
    enabled: true
  },
  DL: {
    code: 'DL',
    name: 'Da Lat',
    center: [11.9404, 108.4583],
    bbox: [108.38, 11.89, 108.50, 12.00],
    mapillaryDelta: 0.005,
    enabled: true
  },
  DH: {
    code: 'DH',
    name: 'Duc Hoa (Long An)',
    center: [10.8888, 106.3825],
    bbox: [106.35, 10.85, 106.45, 10.95],
    mapillaryDelta: 0.005,
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

// Per-city Mapillary query bbox half-side (degrees). Smaller for dense urban
// areas to keep Mapillary query cost under their 'reduce data' cap.
export const cityDeltas = Object.fromEntries(
  Object.values(CITIES).map(city => [city.code, city.mapillaryDelta])
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

// Get accumulated score message
export function getAccumulatedScoreMessage(newScore, totalScore) {
  return `+${newScore} points! Total score: ${totalScore}`;
}

// Get distance color for leaderboard display
export function getDistanceColor(distance) {
  if (distance <= 50) return 'text-green-600';
  if (distance <= 100) return 'text-blue-600';
  if (distance <= 200) return 'text-yellow-600';
  if (distance <= 500) return 'text-orange-600';
  return 'text-red-600';
}

// Get random location within city bbox
export function getRandomCityLocationFromBbox(cityCode) {
  const bbox = cityBboxes[cityCode];
  if (!bbox) {
    throw new Error(`No bbox found for city code: ${cityCode}`);
  }

  const [minLng, minLat, maxLng, maxLat] = bbox;

  const lng = Math.random() * (maxLng - minLng) + minLng;
  const lat = Math.random() * (maxLat - minLat) + minLat;

  return { lat, lng };
}
