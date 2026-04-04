// Mapillary API utilities

// Maximum bbox area allowed by Mapillary API (square degrees)
const MAX_BBOX_AREA = 0.01;

// Pick a random sub-bbox within the city bbox that fits Mapillary's area limit
function getRandomSubBbox(bbox) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const width = maxLng - minLng;
  const height = maxLat - minLat;
  const area = width * height;

  if (area <= MAX_BBOX_AREA) {
    return bbox;
  }

  // Calculate sub-bbox side length (square) that fits within the limit
  const side = Math.sqrt(MAX_BBOX_AREA) * 0.9; // 10% margin for safety
  const subWidth = Math.min(side, width);
  const subHeight = Math.min(side, height);

  const startLng = minLng + Math.random() * (width - subWidth);
  const startLat = minLat + Math.random() * (height - subHeight);

  return [startLng, startLat, startLng + subWidth, startLat + subHeight];
}

// Fetch images from a single bbox query
async function queryMapillary(accessToken, queryBbox) {
  const bboxString = queryBbox.join(',');
  const apiUrl = `https://graph.mapillary.com/images?access_token=${accessToken}&fields=id,thumb_original_url,geometry,is_pano&limit=20&bbox=${bboxString}&is_pano=true`;

  if (process.env.NODE_ENV === 'development') {
    console.log('Mapillary query bbox:', bboxString);
  }

  const response = await fetch(apiUrl, {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Mapillary authentication failed');
    }
    throw new Error(`Mapillary API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data || [];
}

// Fetch images using city bbox, retrying with different sub-bboxes
const MAX_RETRIES = 5;

export async function fetchMapillaryImages(bbox) {
  const accessToken = process.env.MAPILLARY_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('MAPILLARY_ACCESS_TOKEN environment variable is not set');
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const queryBbox = getRandomSubBbox(bbox);
      const images = await queryMapillary(accessToken, queryBbox);

      if (images.length > 0) {
        console.log(`Found ${images.length} images on attempt ${attempt}`);
        return { success: true, data: images };
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`Attempt ${attempt}/${MAX_RETRIES}: no images found, retrying...`);
      }
    } catch (error) {
      console.error(`Attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);
      throw error;
    }
  }

  return {
    success: false,
    error: 'No street view images found in city bbox'
  };
}
