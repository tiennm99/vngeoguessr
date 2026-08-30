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
//
// Each query keeps the same small window and limit as before, so the per-query
// data cost Mapillary caps is unchanged; only the request *rate* went up. A
// round that loses windows to 5xx or network errors therefore backs off before
// the next one, and those windows are budgeted separately from genuine misses:
// a transient Mapillary outage must not be mistaken for a city with no
// panoramic coverage.

// Budget for windows that answered fine but held nothing — genuine misses.
const MAX_EMPTY_WINDOWS = 20;
const WINDOWS_PER_ROUND = 8;
// Separate, smaller budget for rounds that lost windows to errors.
const MAX_ERROR_ROUNDS = 3;
const ERROR_BACKOFF_MS = 750;

// Marker error for a window that answered fine but held no panoramas.
const EMPTY_WINDOW = 'no panos in window';
const AUTH_FAILED = 'Mapillary authentication failed';

/**
 * Pause execution.
 * @param {number} ms Milliseconds to wait.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
  const apiUrl = `https://graph.mapillary.com/images?access_token=${accessToken}&fields=id,thumb_2048_url,thumb_original_url,geometry,is_pano&limit=3&bbox=${queryBbox}&is_pano=true`;

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

  let emptyWindows = 0;
  let errorRounds = 0;
  let lastError = null;

  while (emptyWindows < MAX_EMPTY_WINDOWS && errorRounds < MAX_ERROR_ROUNDS) {
    const roundSize = Math.min(WINDOWS_PER_ROUND, MAX_EMPTY_WINDOWS - emptyWindows);
    const controller = new AbortController();
    const windows = Array.from({ length: roundSize }, () =>
      probeRandomWindow(bbox, delta, accessToken, controller.signal)
    );

    let failures;
    try {
      const panos = await Promise.any(windows);
      // Let the losing windows go; their results are no longer needed.
      controller.abort();
      console.log(`Found ${panos.length} panos in a round of ${roundSize}`);
      return { success: true, data: panos };
    } catch (aggregate) {
      failures = aggregate.errors || [aggregate];
    }

    const authFailure = failures.find(err => err.message === AUTH_FAILED);
    if (authFailure) {
      throw authFailure;
    }

    const hardErrors = failures.filter(err => err.message !== EMPTY_WINDOW);
    emptyWindows += failures.length - hardErrors.length;

    if (hardErrors.length === 0) {
      console.log(`No panos in ${emptyWindows}/${MAX_EMPTY_WINDOWS} windows so far`);
      continue;
    }

    errorRounds++;
    lastError = hardErrors[0].message;
    console.error(
      `Mapillary errored on ${hardErrors.length}/${roundSize} windows ` +
      `(round ${errorRounds}/${MAX_ERROR_ROUNDS}, last: ${lastError}); backing off`
    );
    // Widening pause so a burst of 5xx is not answered with another burst.
    await sleep(ERROR_BACKOFF_MS * errorRounds);
  }

  return {
    success: false,
    error: lastError
      ? `Mapillary unreachable after ${errorRounds} error rounds (last: ${lastError})`
      : `No panos in ${emptyWindows} windows`,
  };
}
