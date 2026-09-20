import { getUpstash, getJson, putJson } from './upstash.js';
import { pickPanoBySeed } from './pano-index.js';
import { fetchPanoramaById } from './mapillary.js';

// The daily challenge: one panorama, the same for everyone, for one day.
//
// SERVER-SIDE ONLY, like pano-index.js: the round's answer passes through here.
//
// The pick is deterministic from the day, so two servers computing it at once
// agree, and it is cached in Redis for two days so the Mapillary lookup and the
// Postgres draw happen once a day rather than once a player. The cached record
// holds the image URL too: Mapillary's signed thumbnail URLs stay valid for
// weeks, far longer than the cache.
//
// There is no daily leaderboard, on purpose. The only identity is a cookie and
// a localStorage name, so a dated board would be won by whoever opened the
// most private windows. One attempt per day is enforced by the browser alone
// (see daily-progress.js), for the same reason: with nothing to win, the only
// person a second attempt cheats is the player.

const DAILY_PREFIX = 'daily:';
const DAILY_TTL_SECONDS = 48 * 60 * 60;
// A deterministic pick can land on an image deleted upstream; step the seed a
// few times before giving up on the day.
const MAX_ATTEMPTS = 4;

/**
 * The panorama for a day, resolved and cached.
 * @param {string} day 'YYYY-MM-DD' from daily-calendar.js.
 * @returns {Promise<{id: string, lat: number, lng: number, regionCode: string, url: string, isPano: boolean}>}
 */
export async function getDailyRound(day) {
  const h = getUpstash();
  const key = `${DAILY_PREFIX}${day}`;
  const cached = await getJson(h, key);
  if (cached) return cached;

  let lastError = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = await pickPanoBySeed(`${day}:${attempt}`);
    try {
      const image = await fetchPanoramaById(candidate.id);
      const round = {
        id: candidate.id,
        lat: image.lat ?? candidate.lat,
        lng: image.lng ?? candidate.lng,
        regionCode: candidate.regionCode,
        url: image.url,
        isPano: image.isPano,
      };
      await putJson(h, key, round, DAILY_TTL_SECONDS);
      return round;
    } catch (error) {
      if (error.message === 'Mapillary authentication failed') throw error;
      lastError = error.message;
      console.error(`Daily ${day} candidate ${candidate.id} failed (${attempt + 1}/${MAX_ATTEMPTS}): ${lastError}`);
    }
  }
  throw new Error(`No daily panorama could be loaded for ${day} (last: ${lastError})`);
}
