export async function getCityBoundingBox(cityName, maxAttempts = 50) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`);
    const data = await response.json();
    const city = data[0];

    if (!city) {
      throw new Error(`City not found: ${cityName}`);
    }

    if (!city.boundingbox) {
      throw new Error(`No boundingbox data available for: ${cityName}`);
    }

    return city.boundingbox.map(Number);
  } catch (error) {
    console.error(`Error getting random location for ${cityName}:`, error);
    throw error;
  }
}
