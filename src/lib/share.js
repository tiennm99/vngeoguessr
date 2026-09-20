// The text a player shares after a round. Client-safe: no storage, no network.
//
// The text names the region the player PICKED and the round's outcome, and
// links to that region's page. It never carries coordinates, the panorama id
// or the district the panorama resolved to: the round is over, but the same
// panorama can be dealt to the next player.

const MAX_POINTS = 5;

/**
 * Build the share text for one round.
 * @param {string} regionName Region the player picked, e.g. 'Ha Noi'.
 * @param {number} score Points earned, 0-5.
 * @param {string} distanceLabel Formatted distance, e.g. '82m'.
 * @param {string} url Absolute URL of the region's game page.
 * @returns {string}
 */
export function buildShareText(regionName, score, distanceLabel, url) {
  const points = Math.min(Math.max(Math.trunc(score) || 0, 0), MAX_POINTS);
  const squares = '🟩'.repeat(points) + '⬜'.repeat(MAX_POINTS - points);
  return `VNGeoGuessr · ${regionName}\n${squares} ${points}/${MAX_POINTS} · ${distanceLabel} away\n${url}`;
}

/**
 * Build the share text for a daily challenge.
 * @param {number} number Challenge number.
 * @param {number} score Points earned, 0-5.
 * @param {string} distanceLabel Formatted distance.
 * @param {number} streak Consecutive days played.
 * @param {string} url Absolute URL of the daily page.
 * @returns {string}
 */
export function buildDailyShareText(number, score, distanceLabel, streak, url) {
  const points = Math.min(Math.max(Math.trunc(score) || 0, 0), MAX_POINTS);
  const squares = '🟩'.repeat(points) + '⬜'.repeat(MAX_POINTS - points);
  const streakLine = streak > 1 ? ` · 🔥 ${streak} days` : '';
  return `VNGeoGuessr Daily #${number}\n${squares} ${points}/${MAX_POINTS} · ${distanceLabel} away${streakLine}\n${url}`;
}

/**
 * Hand text to the platform share sheet, falling back to the clipboard.
 * @param {string} text
 * @returns {Promise<'shared'|'copied'|'cancelled'|'failed'>} What actually happened.
 */
export async function shareText(text) {
  if (typeof navigator === 'undefined') return 'failed';
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (error) {
      // The player closed the sheet: nothing went wrong and nothing to fall
      // back to, so it must not read as a failure.
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
