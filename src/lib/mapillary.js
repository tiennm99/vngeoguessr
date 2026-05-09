// Mapillary API utilities

// Bounding-box area range (square degrees) used by the adaptive query loop.
// - Too big in dense urban regions → Mapillary returns 500 'reduce data'.
// - Too small in sparse regions → no panoramic images returned.
// Loop shrinks on 500 errors and grows on empty results to converge on a
// workable size per city.
const MIN_BBOX_AREA = 0.00005;  // ~250m square
const MAX_BBOX_AREA = 0.003;    // ~5.5km square

// Pick a random sub-bbox of the requested area within the parent bbox.
function getRandomSubBbox(bbox, area) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const width = maxLng - minLng;
  const height = maxLat - minLat;

  const side = Math.sqrt(area) * 0.9; // 10% safety margin
  const subWidth = Math.min(side, width);
  const subHeight = Math.min(side, height);

  const startLng = minLng + Math.random() * Math.max(0, width - subWidth);
  const startLat = minLat + Math.random() * Math.max(0, height - subHeight);

  return [startLng, startLat, startLng + subWidth, startLat + subHeight];
}

// Fetch panoramic images from a single bbox query.
// Returns { ok, images, retryable, error } so the loop can decide adaptive action.
async function queryMapillary(accessToken, queryBbox) {
  const bboxString = queryBbox.join(',');
  const apiUrl = `https://graph.mapillary.com/images?access_token=${accessToken}&fields=id,thumb_2048_url,geometry&limit=1&bbox=${bboxString}&is_pano=true`;

  const response = await fetch(apiUrl, {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '<unreadable>');
    if (response.status === 401) {
      throw new Error('Mapillary authentication failed');
    }
    return { ok: false, retryable: true, error: `${response.status}: ${body.slice(0, 200)}` };
  }

  const data = await response.json();
  return { ok: true, images: data.data || [] };
}

const MAX_RETRIES = 15;
const GROW_FACTOR = 1.6;
const SHRINK_FACTOR = 0.5;

export async function fetchMapillaryImages(bbox) {
  const accessToken = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MAPILLARY_ACCESS_TOKEN environment variable is not set');
  }

  // Start at the geometric mean of the size range — a reasonable middle ground.
  let area = Math.sqrt(MIN_BBOX_AREA * MAX_BBOX_AREA);
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const queryBbox = getRandomSubBbox(bbox, area);
    let result;
    try {
      result = await queryMapillary(accessToken, queryBbox);
    } catch (error) {
      // Auth failures are not transient — abort fast.
      throw error;
    }

    if (result.ok && result.images.length > 0) {
      console.log(`Found ${result.images.length} images on attempt ${attempt} (area=${area.toFixed(5)})`);
      return { success: true, data: result.images };
    }

    if (!result.ok) {
      // 'reduce data' / 'unknown error' — shrink and retry.
      console.error(`Attempt ${attempt}/${MAX_RETRIES} 500 (area=${area.toFixed(5)}): ${result.error}`);
      lastError = result.error;
      area = Math.max(MIN_BBOX_AREA, area * SHRINK_FACTOR);
    } else {
      // OK but empty — grow and retry to widen the search area.
      console.log(`Attempt ${attempt}/${MAX_RETRIES} no panos (area=${area.toFixed(5)})`);
      area = Math.min(MAX_BBOX_AREA, area * GROW_FACTOR);
    }
  }

  return {
    success: false,
    error: lastError
      ? `No street view images found after ${MAX_RETRIES} attempts (last: ${lastError})`
      : 'No street view images found in city bbox',
  };
}
