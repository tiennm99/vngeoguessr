// Mapillary API access.
//
// Locations come from the prebuilt indexes in lib/pano-index.js, so the only
// call left here is a lookup by image id. That endpoint answers in ~230ms and
// works everywhere.
//
// It replaced a dart-throw over /images?bbox=, which was measured returning
// HTTP 500 in every dense district — District 1 and central Ha Noi failed on
// every attempt regardless of window size or limit, because the endpoint counts
// the images inside the box before applying the limit. A 40-window sample
// returned 6 hits, 1 empty window and 33 errors. Do not reintroduce bbox search
// here; the failure is on Mapillary's side and no retry budget fixes it.

import { pickRandomPano } from './pano-index.js';

const GRAPH_API = 'https://graph.mapillary.com';
const FIELDS = 'id,thumb_2048_url,thumb_original_url,geometry,is_pano';
// A by-ID lookup is reliable, but an individual image can have been deleted
// since the index was built, so allow a couple of alternates.
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Read the access token, failing loudly when it is absent.
 * @returns {string} The token.
 */
function requireAccessToken() {
  const accessToken = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MAPILLARY_ACCESS_TOKEN environment variable is not set');
  }
  return accessToken;
}

/**
 * Look up one image by id.
 * @param {string} imageId Mapillary image id.
 * @param {string} accessToken Mapillary access token.
 * @returns {Promise<Object>} The image record.
 */
async function fetchImage(imageId, accessToken) {
  const url = `${GRAPH_API}/${imageId}?access_token=${accessToken}&fields=${FIELDS}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    next: { revalidate: 0 },
  });

  if (response.status === 401) throw new Error('Mapillary authentication failed');
  if (!response.ok) {
    const body = await response.text().catch(() => '<unreadable>');
    throw new Error(`${response.status}: ${body.slice(0, 200)}`);
  }
  return await response.json();
}

/**
 * Resolve one panorama id to something the viewer can display.
 * @param {string} imageId Mapillary image id.
 * @returns {Promise<{id: string, url: string, isPano: boolean, lat: number, lng: number}>}
 */
export async function fetchPanoramaById(imageId) {
  const image = await fetchImage(imageId, requireAccessToken());
  // The original is often 4-8 MP; the 2048px derivative is the one the viewer
  // should load on a phone.
  const url = image.thumb_2048_url || image.thumb_original_url;
  if (!url) throw new Error('image has no usable thumbnail');

  return {
    id: String(image.id),
    url,
    isPano: image.is_pano ?? true,
    lat: image.geometry?.coordinates?.[1] ?? null,
    lng: image.geometry?.coordinates?.[0] ?? null,
  };
}

/**
 * Choose a panorama for a city and resolve it to a usable image.
 * @param {string} cityCode City code, e.g. 'TPHCM'.
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function fetchCityPanorama(cityCode) {
  requireAccessToken();

  const tried = new Set();
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const candidate = pickRandomPano(cityCode, tried);
    tried.add(candidate.id);

    try {
      const image = await fetchPanoramaById(candidate.id);
      return {
        success: true,
        data: {
          ...image,
          // Trust the API's coordinates, falling back to the index's copy.
          lat: image.lat ?? candidate.lat,
          lng: image.lng ?? candidate.lng,
        },
      };
    } catch (error) {
      lastError = error.message;
      if (error.message === 'Mapillary authentication failed') throw error;
      console.error(`Mapillary lookup ${candidate.id} failed (${attempt}/${MAX_ATTEMPTS}): ${lastError}`);
    }
  }

  return {
    success: false,
    error: `No panorama could be loaded after ${MAX_ATTEMPTS} attempts (last: ${lastError})`,
  };
}
