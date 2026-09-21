import {
  getUpstash,
  zAdd,
  zIncrBy,
  zRangeWithScores,
  zRank,
  zRevRank,
  zRemRangeByRank,
} from './upstash.js';
import { ancestorsOf, isRegion, regionName, COUNTRY_CODE } from './regions.js';
import { calculateScore } from './game.js';

// Leaderboard logical key constants (prefix is applied inside the adapter).
//
// A guess is credited to the district its panorama sits in, then rolled upward:
// district, province, country. Each level keeps its own board, so a player can
// top District 7 without touching the national table.
const GLOBAL_LEADERBOARD_KEY = 'leaderboard:vietnam';
const CITY_LEADERBOARD_PREFIX = 'leaderboard:city:';
const DISTANCE_GLOBAL_KEY = 'distance:vietnam';
const DISTANCE_CITY_PREFIX = 'distance:city:';
// How much of a board is ever served, and how many distance records a board
// keeps. Score boards are NOT trimmed to this: a score board holds one member
// per player name, so it grows with the player count and no faster, and
// trimming it used to delete the running total of anyone outside the window --
// their next round then started again from zero, and once 200th place held
// more than one round's worth of points nobody new could ever get on. Distance
// boards gain a member every round, so those are still trimmed.
const MAX_LEADERBOARD_SIZE = 200;
// A caller asking for more than the board serves is asking for the board.
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
 * @param {number} points Points to add at this level.
 * @param {string} username Player.
 * @returns {Promise<Object>} Level result.
 */
async function creditScore(h, regionCode, points, username) {
  const key = getRegionLeaderboardKey(regionCode);
  // One atomic command: a read-then-write here lost an increment whenever two
  // rounds under the same name finished together.
  const total = await zIncrBy(h, key, points, username);
  const rank = await zRevRank(h, key, username);
  return {
    code: regionCode,
    name: regionName(regionCode),
    username,
    // What this round added at this level.
    points,
    score: total,
    // 1-based. Every player has one: the board is never trimmed, so a total
    // is never lost, only served or not served by getLeaderboard's window.
    rank: rank === null ? null : rank + 1,
  };
}

/**
 * Credit every level above a region, each by its own point value.
 * @param {Object} h Upstash handle.
 * @param {string} username Trimmed player name.
 * @param {string} regionCode Leaf region the panorama was in.
 * @param {Function} pointsFor Region code -> points to add at that level.
 * @returns {Promise<Object>} Per-level results with named aliases.
 */
async function fanOutScore(h, username, regionCode, pointsFor) {
  // In parallel: the levels are independent keys and no level reads another's
  // state, so serialising them would add two round trips of latency to every
  // guess for nothing. The calls WITHIN a level stay ordered.
  //
  // Settled, not all-or-nothing: the caller has already consumed the session,
  // so a level that failed cannot be retried and a level that succeeded cannot
  // be undone. Reporting what landed beats reporting a total failure over a
  // round that is partly on the boards. Only when nothing landed is it one.
  const codes = ancestorsOf(regionCode);
  const settled = await Promise.allSettled(
    codes.map((code) => creditScore(h, code, pointsFor(code), username))
  );
  const levels = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const failures = settled.filter((r) => r.status === 'rejected');
  for (const [i, r] of settled.entries()) {
    if (r.status === 'rejected') console.error(`Score credit failed at ${codes[i]}:`, r.reason);
  }
  if (levels.length === 0) {
    throw failures[0]?.reason ?? new Error('No level could be credited');
  }

  // `levels` is the whole answer: innermost first, and the chain is district ->
  // province -> country for a leaf but only province -> country when a
  // panorama fell outside every district polygon, so callers look a level up
  // by code rather than by position.
  return { levels, partial: failures.length > 0 };
}

/**
 * Score one round's distance onto every board above a region.
 *
 * Every level converts the distance against the same ladder, so one round
 * records the identical points on its district, province and country board.
 * @param {string} username Player username.
 * @param {number} distance Distance achieved in metres.
 * @param {string} regionCode Region the panorama was in.
 * @returns {Promise<Object>} Per-level results, each with the points added.
 */
export async function submitRoundScore(username, distance, regionCode) {
  try {
    const h = getUpstash();

    if (!username || distance === undefined || !regionCode) {
      throw new Error('Missing required fields: username, distance, regionCode');
    }
    requireRegion(regionCode);

    // Rejected, not coerced: Number(null) and Number('') are 0, and a
    // 0-metre distance is a maximum-score fan-out to every board.
    if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) {
      throw new Error(`Invalid distance: ${distance}`);
    }
    return await fanOutScore(h, username.trim(), regionCode, () => calculateScore(distance));
  } catch (error) {
    console.error('Error submitting round score:', error);
    throw new Error(error.message || 'Failed to submit round score');
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
    name: regionName(regionCode),
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
    // The same rule the score path applies, for the same reason: Number(null)
    // is a 0-metre record on every board.
    if (!Number.isFinite(numDistance) || numDistance < 0) {
      throw new Error(`Invalid distance: ${distance}`);
    }

    // One id for all levels, so the same record is recognisable as one attempt
    // wherever it appears rather than looking like three separate guesses.
    const entryId = `${trimmedUsername}:${numDistance}:${Date.now()}`;

    const levels = await Promise.all(
      ancestorsOf(regionCode).map((code) =>
        creditDistance(h, code, numDistance, entryId, trimmedUsername)
      )
    );

    return { levels };
  } catch (error) {
    console.error('Error submitting distance record:', error);
    throw new Error(error.message || 'Failed to submit distance record');
  }
}
