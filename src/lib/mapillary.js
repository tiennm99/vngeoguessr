// Mapillary API utilities

// Maximum bbox area allowed per Mapillary query (square degrees).
// Mapillary returns 500 'reduce data' / 'unknown error' on dense urban bboxes,
// so we keep each query small (~1km square) and rely on the retry loop to
// re-roll a new random sub-bbox if one query fails or returns empty.
const MAX_BBOX_AREA = 0.0005;

// Pick a random sub-bbox within the city bbox that fits Mapillary's area limit.
function getRandomSubBbox(bbox) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const width = maxLng - minLng;
  const height = maxLat - minLat;

  // Always sub-sample even if the parent bbox is smaller than the cap — a
  // smaller window keeps Mapillary happy in dense regions like central Hanoi.
  const side = Math.sqrt(MAX_BBOX_AREA) * 0.9; // 10% safety margin
  const subWidth = Math.min(side, width);
  const subHeight = Math.min(side, height);

  const startLng = minLng + Math.random() * Math.max(0, width - subWidth);
  const startLat = minLat + Math.random() * Math.max(0, height - subHeight);

  return [startLng, startLat, startLng + subWidth, startLat + subHeight];
}

// Fetch images from a single bbox query.
async function queryMapillary(accessToken, queryBbox) {
  const bboxString = queryBbox.join(',');
  const apiUrl = `https://graph.mapillary.com/images?access_token=${accessToken}&fields=id,thumb_2048_url,geometry&limit=1&bbox=${bboxString}&is_pano=true`;

  const response = await fetch(apiUrl, {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '<unreadable>');
    console.error(`Mapillary ${response.status} body:`, body.slice(0, 500));
    console.error('Mapillary URL (token redacted):', apiUrl.replace(accessToken, '<TOKEN>'));
    if (response.status === 401) {
      throw new Error('Mapillary authentication failed');
    }
    throw new Error(`Mapillary API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data || [];
}

// Fetch panoramic images, retrying with a fresh sub-bbox on failure or empty
// result. Auth failures still abort early.
const MAX_RETRIES = 8;

export async function fetchMapillaryImages(bbox) {
  const accessToken = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MAPILLARY_ACCESS_TOKEN environment variable is not set');
  }

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const queryBbox = getRandomSubBbox(bbox);
    try {
      const images = await queryMapillary(accessToken, queryBbox);
      if (images.length > 0) {
        console.log(`Found ${images.length} images on attempt ${attempt}`);
        return { success: true, data: images };
      }
      console.log(`Attempt ${attempt}/${MAX_RETRIES}: no images, retrying with new sub-bbox`);
    } catch (error) {
      // Auth issues are not transient — abort fast.
      if (error.message === 'Mapillary authentication failed') throw error;
      lastError = error;
      console.error(`Attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}; retrying with new sub-bbox`);
    }
  }

  return {
    success: false,
    error: lastError
      ? `No street view images found after ${MAX_RETRIES} attempts (last: ${lastError.message})`
      : 'No street view images found in city bbox',
  };
}
