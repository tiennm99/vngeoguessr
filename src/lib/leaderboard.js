import {
  getUpstash,
  zAdd,
  zScore,
  zRangeWithScores,
  zRank,
  zRevRank,
  zRemRangeByRank,
} from './upstash.js';
import { ancestorsOf, getRegion, isRegion, COUNTRY_CODE } from './regions.js';

// Leaderboard logical key constants (prefix is applied inside the adapter).
//
// A guess is credited to the district its panorama sits in, then rolled upward:
// district, province, country. Each level keeps its own board, so a player can
// top District 7 without touching the national table.
const GLOBAL_LEADERBOARD_KEY = 'leaderboard:vietnam';
const CITY_LEADERBOARD_PREFIX = 'leaderboard:city:';
const DISTANCE_GLOBAL_KEY = 'distance:vietnam';
const DISTANCE_CITY_PREFIX = 'distance:city:';
const MAX_LEADERBOARD_SIZE = 200;
// A caller asking for more than the board can hold is asking for the board.
const MAX_LIMIT = MAX_LEADERBOARD_SIZE;

/**
 * Reject anything that is not a region before it reaches a key name.
 *
 * Validated here rather than only in the route: the routes are not the only
 * callers, and `getRegionLeaderboardKey` lowercases whatever it is handed
 * straight into a Redis key. A typo would quietly create a board nobody reads.
 * @param {string} regionCode Region code.
 * @returns {string} The same code.
 */
function requireRegion(regionCode) {
  if (!isRegion(regionCode)) {
    throw new Error(`Unknown region: ${regionCode}`);
  }
  return regionCode;
}

/**
 * Score-board key for a region.
 *
 * The country maps to the pre-existing global key rather than to
 * `leaderboard:city:vn`, so the national board players already have keeps
 * accumulating instead of restarting.
 * @param {string} regionCode Region code.
 * @returns {string} Logical key.
 */
function getRegionLeaderboardKey(regionCode) {
  if (regionCode === COUNTRY_CODE) return GLOBAL_LEADERBOARD_KEY;
  return `${CITY_LEADERBOARD_PREFIX}${regionCode.toLowerCase()}`;
}

/**
 * Distance-board key for a region.
 * @param {string|null} regionCode Region code, or null for the country.
 * @returns {string} Logical key.
 */
function getDistanceLeaderboardKey(regionCode) {
  if (!regionCode || regionCode === COUNTRY_CODE) return DISTANCE_GLOBAL_KEY;
  return `${DISTANCE_CITY_PREFIX}${regionCode.toLowerCase()}`;
}

// Both key builders, so scripts/lib/leaderboard-migration.mjs derives the keys
// it copies from the same code the app writes through. Hardcoding the prefixes
// there would let a change here silently point the migration at old names.
export const leaderboardKeys = {
  score: getRegionLeaderboardKey,
  distance: getDistanceLeaderboardKey,
};

/**
 * Get a leaderboard for one region.
 * @param {string|null} regionCode Region code, or null for the country.
 * @param {number} limit Number of entries to return.
 * @param {string} type 'score' (highest first) or 'distance' (lowest first).
 * @returns {Promise<Array>} Leaderboard entries.
 */
export async function getLeaderboard(regionCode = null, limit = 100, type = 'score') {
  try {
    const h = getUpstash();
    // `||` not `??`: `?city=` on the route yields an empty string, which used
    // to mean the global board and must keep meaning it.
    const region = regionCode || COUNTRY_CODE;
    requireRegion(region);

    // Clamp rather than trust: `parseInt(x) || 100` upstream accepts -1, which
    // reaches the adapter as a range of (0, -2) and returns a surprise slice.
    const size = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(limit) || 100)));

    const leaderboardKey =
      type === 'distance'
        ? getDistanceLeaderboardKey(region)
        : getRegionLeaderboardKey(region);

    // Score boards read highest first; distance boards lowest first.
    const rev = type !== 'distance';
    const leaderboardData = await zRangeWithScores(h, leaderboardKey, 0, size - 1, rev);

    const entries = [];
    for (let i = 0; i < leaderboardData.length; i++) {
      const entry = leaderboardData[i];
      if (type === 'distance') {
        // Distance entries encoded as "username:distance:timestamp".
        const [username, distance, timestamp] = entry.value.split(':');
        entries.push({
          username,
          distance: Number(distance),
          timestamp: Number(timestamp),
          rank: i + 1,
        });
      } else {
        entries.push({
          username: entry.value,
          score: Number(entry.score),
          rank: i + 1,
        });
      }
    }

    return entries;
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    throw error;
  }
}

/**
 * Add a score to one region's board and return the new total and rank.
 * @param {Object} h Upstash handle.
 * @param {string} regionCode Region code.
 * @param {number} score Points to add.
 * @param {string} username Player.
 * @returns {Promise<Object>} Level result.
 */
async function creditScore(h, regionCode, score, username) {
  const key = getRegionLeaderboardKey(regionCode);
  const existing = await zScore(h, key, username);
  const total = (existing || 0) + score;

  await zAdd(h, key, total, username);
  // Trim to the top MAX_LEADERBOARD_SIZE. The set is ascending, so drop the
  // lowest-ranked entries that fall outside the window.
  await zRemRangeByRank(h, key, 0, -(MAX_LEADERBOARD_SIZE + 1));

  const rank = await zRevRank(h, key, username);
  // A player outside the top 200 is trimmed straight back out, so the total
  // just computed is no longer stored anywhere. Reporting it would show a
  // national score that silently resets on the next guess.
  const trimmed = rank === null;
  return {
    code: regionCode,
    name: getRegion(regionCode).name,
    username,
    score: trimmed ? null : Number(total),
    rank: trimmed ? null : rank + 1,
    trimmed,
  };
}

/**
 * Submit a score to a region and every region above it.
 *
 * Fans out over the ancestor chain, so a guess in District 7 credits the
 * district, Ho Chi Minh, and Vietnam by the same amount.
 * @param {string} username Player username.
 * @param {number} score Score achieved (0-5).
 * @param {string} regionCode Region the panorama was in.
 * @returns {Promise<Object>} Per-level results.
 */
export async function submitScore(username, score, regionCode) {
  try {
    const h = getUpstash();

    if (!username || score === undefined || !regionCode) {
      throw new Error('Missing required fields: username, score, regionCode');
    }
    requireRegion(regionCode);

    const trimmedUsername = username.trim();
    const numScore = Number(score);

    // In parallel: the levels are independent keys and no level reads another's
    // state, so serialising them would add two round trips of latency to every
    // guess for nothing. The four calls WITHIN a level stay ordered.
    const levels = await Promise.all(
      ancestorsOf(regionCode).map((code) => creditScore(h, code, numScore, trimmedUsername))
    );

    // Named aliases alongside the array: the chain is district -> province ->
    // country for a leaf, but only province -> country when a panorama fell
    // outside every district polygon, so callers cannot index by position.
    const byLevel = (level) =>
      levels.find((entry) => getRegion(entry.code).level === level) ?? null;

    return {
      success: true,
      levels,
      district: byLevel('district'),
      province: byLevel('province'),
      global: byLevel('country'),
      // `city` is the pre-tree name for the province level. Kept so /api/guess
      // keeps reporting a rank until the API surface moves to `levels`.
      city: byLevel('province'),
      message: `Score added at ${levels.length} levels (+${numScore})`,
    };
  } catch (error) {
    console.error('Error submitting score:', error);
    throw new Error(error.message || 'Failed to submit score');
  }
}

/**
 * Add one distance record to a region's board.
 * @param {Object} h Upstash handle.
 * @param {string} regionCode Region code.
 * @param {number} distance Distance in metres.
 * @param {string} entryId Shared id for this record across levels.
 * @param {string} username Player.
 * @returns {Promise<Object>} Level result.
 */
async function creditDistance(h, regionCode, distance, entryId, username) {
  const key = getDistanceLeaderboardKey(regionCode);

  // Lower is better, so the distance is the score directly.
  await zAdd(h, key, distance, entryId);
  // Ascending set, so everything past the window is the worst.
  await zRemRangeByRank(h, key, MAX_LEADERBOARD_SIZE, -1);

  const rank = await zRank(h, key, entryId);
  return {
    code: regionCode,
    name: getRegion(regionCode).name,
    username,
    distance,
    rank: rank !== null ? rank + 1 : null,
  };
}

/**
 * Submit a distance record to a region and every region above it.
 * @param {string} username Player username.
 * @param {number} distance Distance achieved in metres.
 * @param {string} regionCode Region the panorama was in.
 * @returns {Promise<Object>} Per-level results.
 */
export async function submitDistanceRecord(username, distance, regionCode) {
  try {
    const h = getUpstash();

    if (!username || distance === undefined || !regionCode) {
      throw new Error('Missing required fields: username, distance, regionCode');
    }
    requireRegion(regionCode);

    const trimmedUsername = username.trim();
    const numDistance = Number(distance);

    // One id for all levels, so the same record is recognisable as one attempt
    // wherever it appears rather than looking like three separate guesses.
    const entryId = `${trimmedUsername}:${numDistance}:${Date.now()}`;

    const levels = await Promise.all(
      ancestorsOf(regionCode).map((code) =>
        creditDistance(h, code, numDistance, entryId, trimmedUsername)
      )
    );

    const byLevel = (level) =>
      levels.find((entry) => getRegion(entry.code).level === level) ?? null;

    return {
      success: true,
      levels,
      districtDistance: byLevel('district'),
      provinceDistance: byLevel('province'),
      globalDistance: byLevel('country'),
      // Pre-tree name for the province level; see submitScore.
      cityDistance: byLevel('province'),
      message: `Distance record: ${numDistance}m`,
    };
  } catch (error) {
    console.error('Error submitting distance record:', error);
    throw new Error(error.message || 'Failed to submit distance record');
  }
}
