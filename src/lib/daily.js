import { getUpstash, getJson, putJson, del } from './upstash.js';
import { pickPanoBySeed } from './pano-index.js';
import { fetchPanoramaById } from './mapillary.js';
import { isAuthFailure } from './errors.js';

// The daily challenge: one panorama, the same for everyone, for one day.
//
// SERVER-SIDE ONLY, like pano-index.js: the round's answer passes through here.
//
// The pick is deterministic from the day, so two servers computing it at once
// agree, and the pick (id, coordinates, district) is cached in Redis for two
// days so the Postgres draw happens once a day. The image URL is NOT cached:
// it is resolved from Mapillary on every request, as every ordinary round
// already does, so a signed URL that stops working never breaks the day, and
// a panorama deleted upstream is replaced by the next seeded candidate.
//
// There is no daily leaderboard and the daily credits none of the main boards
// either (see /api/guess): the answer is in the first guess response and the
// panorama is the same all day, so any board it fed would be farmable. One
// attempt per day is enforced by the browser alone (daily-progress.js), which
// is enough once nothing can be won by a second one.

const DAILY_PREFIX = 'daily:';
const DAILY_TTL_SECONDS = 48 * 60 * 60;
// A seeded pick can land on an image deleted upstream; step the seed a few
// times before giving up on the day.
const MAX_ATTEMPTS = 4;

/**
 * The panorama for a day, resolved to a displayable image.
 * @param {string} day 'YYYY-MM-DD' from daily-calendar.js.
 * @returns {Promise<{id: string, lat: number, lng: number, regionCode: string, url: string, isPano: boolean}>}
 */
export async function getDailyRound(day) {
  const h = getUpstash();
  const key = `${DAILY_PREFIX}${day}`;

  const cached = await getJson(h, key);
  if (cached) {
    try {
      return withImage(cached, await fetchPanoramaById(cached.id));
    } catch (error) {
      if (isAuthFailure(error)) throw error;
      // The day's pick no longer resolves. Forget it and choose again, skipping
      // this id, so the day recovers instead of failing until the cache expires.
      console.error(`Daily ${day} cached panorama ${cached.id} failed: ${error.message}`);
      await del(h, key);
    }
  }

  const skip = new Set(cached ? [cached.id] : []);
  let lastError = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = await pickPanoBySeed(`${day}:${attempt}`);
    if (skip.has(candidate.id)) continue;
    try {
      const image = await fetchPanoramaById(candidate.id);
      const pick = {
        id: candidate.id,
        lat: image.lat ?? candidate.lat,
        lng: image.lng ?? candidate.lng,
        regionCode: candidate.regionCode,
      };
      await putJson(h, key, pick, DAILY_TTL_SECONDS);
      return withImage(pick, image);
    } catch (error) {
      if (isAuthFailure(error)) throw error;
      lastError = error.message;
      console.error(`Daily ${day} candidate ${candidate.id} failed (${attempt + 1}/${MAX_ATTEMPTS}): ${lastError}`);
    }
  }
  throw new Error(`No daily panorama could be loaded for ${day} (last: ${lastError})`);
}

/** The cached pick plus the image just resolved for it. */
function withImage(pick, image) {
  return { ...pick, url: image.url, isPano: image.isPano };
}
