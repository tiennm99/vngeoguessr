import * as turf from '@turf/turf';

// Cities enum-like structure
export const CITIES = {
  HN: {
    code: 'HN',
    name: 'Ha Noi',
    nominatimName: 'Hanoi, Vietnam',
    center: [21.0285, 105.8542]
  },
  TPHCM: {
    code: 'TPHCM',
    name: 'TP. Ho Chi Minh',
    nominatimName: 'Ho Chi Minh City, Vietnam',
    center: [10.8231, 106.6297]
  },
  HP: {
    code: 'HP',
    name: 'Hai Phong',
    nominatimName: 'Hai Phong, Vietnam',
    center: [20.8449, 106.6881]
  },
  ND: {
    code: 'ND',
    name: 'Nam Dinh',
    nominatimName: 'Nam Dinh, Vietnam',
    center: [20.4388, 106.1621]
  },
  DN: {
    code: 'DN',
    name: 'Da Nang',
    nominatimName: 'Da Nang, Vietnam',
    center: [16.0544, 108.2022]
  },
  DL: {
    code: 'DL',
    name: 'Da Lat',
    nominatimName: 'Da Lat, Vietnam',
    center: [11.9404, 108.4583]
  }
};

// Helper functions for backward compatibility
export const cityCenters = Object.fromEntries(
  Object.values(CITIES).map(city => [city.code, city.center])
);

export const cityNames = Object.fromEntries(
  Object.values(CITIES).map(city => [city.code, city.name])
);

export const cityNominatimNames = Object.fromEntries(
  Object.values(CITIES).map(city => [city.code, city.nominatimName])
);

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
    // Fallback to simple calculation if Turf fails
    const radlat1 = Math.PI * lat1 / 180;
    const radlat2 = Math.PI * lat2 / 180;
    const theta = lon1 - lon2;
    const radtheta = Math.PI * theta / 180;

    let dist = Math.sin(radlat1) * Math.sin(radlat2) +
               Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);

    if (dist > 1) dist = 1;

    dist = Math.acos(dist);
    dist = dist * 180 / Math.PI;
    dist = dist * 60 * 1.1515 * 1.609344 * 1000; // Convert to meters

    return Math.round(dist);
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

// Format time in MM:SS format
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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

// Get random location within city boundaries using accurate polygon matching
export async function getRandomCityLocation(cityName, maxAttempts = 50) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&polygon_geojson=1&limit=1`);
    const data = await response.json();
    const city = data[0];

    if (!city) {
      throw new Error(`City not found: ${cityName}`);
    }

    if (!city.geojson) {
      throw new Error(`No polygon data available for: ${cityName}`);
    }

    const cityFeature = turf.feature(city.geojson);
    const [minLng, minLat, maxLng, maxLat] = turf.bbox(cityFeature);

    for (let i = 0; i < maxAttempts; i++) {
      const lng = Math.random() * (maxLng - minLng) + minLng;
      const lat = Math.random() * (maxLat - minLat) + minLat;
      const point = turf.point([lng, lat]);

      if (turf.booleanPointInPolygon(point, cityFeature)) {
        return { lat, lng };
      }
    }

    // If we can't find a point within the polygon, use the centroid
    console.warn(`No point found within polygon for ${cityName}, using centroid`);
    const centroid = turf.centroid(cityFeature);
    return {
      lat: centroid.geometry.coordinates[1],
      lng: centroid.geometry.coordinates[0]
    };

  } catch (error) {
    console.error(`Error getting random location for ${cityName}:`, error);
    throw error;
  }
}
