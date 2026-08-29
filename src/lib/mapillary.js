// Mapillary API utilities
//
// Strategy ported from viguessr (https://github.com/luuvanduc1999/viguessr):
// pick a random point inside the city bbox, query a small fixed-size sub-bbox
// (side = 2*delta) centered on that point, and re-roll the point on empty
// results or transient 5xx. The fixed small size keeps Mapillary query cost
// below their cap; the dart-throw eventually lands on a pano-rich window.
//
// The dart throws run in concurrent rounds rather than one at a time. A single
// Mapillary round-trip costs ~1s (up to ~5s when it answers 500), and most
// windows are empty, so throwing them sequentially made the wall time the sum
// of every miss. Throwing a whole round at once makes it the cost of one
// round-trip: the first window that yields panoramas wins and the losers are
// aborted.

const MAX_ATTEMPTS = 20;
const ATTEMPTS_PER_ROUND = 8;

// Marker error for a window that answered fine but held no panoramas.
const EMPTY_WINDOW = 'no panos in window';
const AUTH_FAILED = 'Mapillary authentication failed';

/**
 * Query one random sub-bbox for panoramas.
 * Rejects on empty results so the caller can race windows with Promise.any.
 * @param {number[]} bbox City bbox as [minLng, minLat, maxLng, maxLat].
 * @param {number} delta Half-side of the query window, in degrees.
 * @param {string} accessToken Mapillary access token.
 * @param {AbortSignal} signal Aborted once a sibling window wins.
 * @returns {Promise<Object[]>} Panoramic images found in the window.
 */
async function probeRandomWindow(bbox, delta, accessToken, signal) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const lat = Math.random() * (maxLat - minLat) + minLat;
  const lng = Math.random() * (maxLng - minLng) + minLng;
  const queryBbox = [
    (lng - delta).toFixed(4),
    (lat - delta).toFixed(4),
    (lng + delta).toFixed(4),
    (lat + delta).toFixed(4),
  ].join(',');
  const apiUrl = `https://graph.mapillary.com/images?access_token=${accessToken}&fields=id,thumb_original_url,geometry,is_pano&limit=3&bbox=${queryBbox}&is_pano=true`;

  const response = await fetch(apiUrl, {
    headers: { Accept: 'application/json' },
    signal,
    next: { revalidate: 0 },
  });

  if (response.status === 401) {
    throw new Error(AUTH_FAILED);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '<unreadable>');
    throw new Error(`${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const panos = (data.data || []).filter(img => img.is_pano);
  if (panos.length === 0) {
    throw new Error(EMPTY_WINDOW);
  }
  return panos;
}

/**
 * Find panoramic images somewhere inside a city bbox.
 * @param {number[]} bbox City bbox as [minLng, minLat, maxLng, maxLat].
 * @param {number} delta Half-side of each query window, in degrees.
 * @returns {Promise<{success: boolean, data?: Object[], error?: string}>}
 */
export async function fetchMapillaryImages(bbox, delta) {
  const accessToken = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MAPILLARY_ACCESS_TOKEN environment variable is not set');
  }

  let attemptsSpent = 0;
  let lastError = null;

  while (attemptsSpent < MAX_ATTEMPTS) {
    const roundSize = Math.min(ATTEMPTS_PER_ROUND, MAX_ATTEMPTS - attemptsSpent);
    const controller = new AbortController();
    const windows = Array.from({ length: roundSize }, () =>
      probeRandomWindow(bbox, delta, accessToken, controller.signal)
    );

    try {
      const panos = await Promise.any(windows);
      // Let the losing windows go; their results are no longer needed.
      controller.abort();
      console.log(`Found ${panos.length} panos after ${attemptsSpent + roundSize} windows`);
      return { success: true, data: panos };
    } catch (aggregate) {
      const errors = aggregate.errors || [aggregate];
      const authFailure = errors.find(err => err.message === AUTH_FAILED);
      if (authFailure) {
        throw authFailure;
      }
      const realFailure = errors.find(err => err.message !== EMPTY_WINDOW);
      if (realFailure) {
        lastError = realFailure.message;
      }
      attemptsSpent += roundSize;
      console.log(`${attemptsSpent}/${MAX_ATTEMPTS} windows tried; no panos yet`);
    }
  }

  return {
    success: false,
    error: lastError
      ? `No panos after ${MAX_ATTEMPTS} windows (last: ${lastError})`
      : 'No panos found',
  };
}
