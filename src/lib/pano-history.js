// The panoramas a player has recently been shown.
//
// Round generation draws from a pool of 424,617 panoramas, but a player who
// grinds one district draws from a few hundred, and with no memory between
// rounds the same street corner comes back. This keeps the last 50 ids each
// player saw so the next draw can exclude them.
//
// Stored as a JSON array in a single string key rather than a Redis LIST.
// LPUSH + LTRIM is the textbook shape for a capped recent list, but it would
// mean four new primitives in upstash.js and a whole new value type in the
// in-memory fake, to hold at most fifty short strings. The trade is that
// read-modify-write is not atomic: two rounds started at the same instant by
// one player can drop one entry, and the entire consequence of that is a
// marginally higher chance of a repeat.
//
// SERVER-SIDE ONLY, and strictly so. The newest entry is recorded when the
// round is CREATED, which makes it the id of the panorama the player is
// currently looking at -- and with a panorama id the answer coordinates are one
// Mapillary lookup away. That is the same reason route.js keeps imageId out of
// the response body. tests/regions.test.js walks the client import graph and
// fails on any component that reaches this module.

import { getUpstash, getJson, putJson } from './upstash.js';

const HISTORY_KEY_PREFIX = 'history:';

export const HISTORY_LIMIT = 50;
export const HISTORY_TTL = 3 * 24 * 60 * 60; // 3 days in seconds

/**
 * The panoramas a player has recently seen, newest first.
 * @param {string} playerId Anonymous player id.
 * @returns {Promise<string[]>} Up to HISTORY_LIMIT panorama ids, [] when none.
 */
export async function getRecentPanoIds(playerId) {
  const h = getUpstash();
  const stored = await getJson(h, HISTORY_KEY_PREFIX + playerId);
  // A key holding anything but an array is a corrupt write, not a crash: no
  // history is a perfectly good answer, and the next record overwrites it.
  if (!Array.isArray(stored)) return [];
  return stored.filter((id) => typeof id === 'string');
}

/**
 * Record a panorama as seen by a player.
 *
 * Writing on every round refreshes the TTL, so an active player's history
 * never expires while an idle one's clears itself after three days.
 * @param {string} playerId Anonymous player id.
 * @param {string} panoId The panorama that was just shown.
 * @returns {Promise<void>}
 */
export async function recordPanoId(playerId, panoId) {
  const h = getUpstash();
  const recent = await getRecentPanoIds(playerId);
  // Drop any existing copy before prepending. A repeat that got through the
  // exclusion -- the fallback path deliberately allows one when a pool is
  // exhausted -- should move to the front, not hold two of the fifty slots.
  const next = [panoId, ...recent.filter((id) => id !== panoId)].slice(0, HISTORY_LIMIT);
  await putJson(h, HISTORY_KEY_PREFIX + playerId, next, HISTORY_TTL);
}
