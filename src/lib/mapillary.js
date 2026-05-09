// Mapillary API utilities
//
// Strategy ported from viguessr (https://github.com/luuvanduc1999/viguessr):
// pick a random point inside the city bbox, query a small fixed-size sub-bbox
// (side = 2*delta) centered on that point, and re-roll the point on empty
// results or transient 5xx. The fixed small size keeps Mapillary query cost
// below their cap; the dart-throw eventually lands on a pano-rich window.

const MAX_RETRIES = 10;

export async function fetchMapillaryImages(bbox, delta) {
  const accessToken = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MAPILLARY_ACCESS_TOKEN environment variable is not set');
  }

  const [minLng, minLat, maxLng, maxLat] = bbox;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const lat = Math.random() * (maxLat - minLat) + minLat;
    const lng = Math.random() * (maxLng - minLng) + minLng;
    const queryBbox = [
      (lng - delta).toFixed(4),
      (lat - delta).toFixed(4),
      (lng + delta).toFixed(4),
      (lat + delta).toFixed(4),
    ].join(',');
    const apiUrl = `https://graph.mapillary.com/images?access_token=${accessToken}&fields=id,thumb_original_url,geometry,is_pano&limit=3&bbox=${queryBbox}&is_pano=true`;

    try {
      const response = await fetch(apiUrl, {
        headers: { Accept: 'application/json' },
        next: { revalidate: 0 },
      });

      if (response.status === 401) {
        throw new Error('Mapillary authentication failed');
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '<unreadable>');
        lastError = `${response.status}: ${body.slice(0, 200)}`;
        console.error(`Attempt ${attempt}/${MAX_RETRIES}: Mapillary ${response.status}; re-rolling`);
        continue;
      }

      const data = await response.json();
      const images = data.data || [];
      const panos = images.filter(img => img.is_pano);

      if (panos.length > 0) {
        console.log(`Found ${panos.length} panos on attempt ${attempt}`);
        return { success: true, data: panos };
      }

      console.log(`Attempt ${attempt}/${MAX_RETRIES}: no panos; re-rolling`);
    } catch (error) {
      if (error.message === 'Mapillary authentication failed') {
        throw error;
      }
      lastError = error.message;
      console.error(`Attempt ${attempt}/${MAX_RETRIES} threw: ${error.message}; re-rolling`);
    }
  }

  return {
    success: false,
    error: lastError
      ? `No panos after ${MAX_RETRIES} attempts (last: ${lastError})`
      : 'No panos found',
  };
}
