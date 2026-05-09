import {
  getUpstash,
  zAdd,
  zScore,
  zRangeWithScores,
  zRank,
  zRevRank,
  zRemRangeByRank,
} from './upstash.js';

// Leaderboard logical key constants (prefix is applied inside the adapter).
const GLOBAL_LEADERBOARD_KEY = 'leaderboard:vietnam';
const CITY_LEADERBOARD_PREFIX = 'leaderboard:city:';
const DISTANCE_GLOBAL_KEY = 'distance:vietnam';
const DISTANCE_CITY_PREFIX = 'distance:city:';
const MAX_LEADERBOARD_SIZE = 200;

// Helper: city-specific score leaderboard key.
function getCityLeaderboardKey(cityCode) {
  return `${CITY_LEADERBOARD_PREFIX}${cityCode.toLowerCase()}`;
}

// Helper: distance leaderboard key (global or city).
function getDistanceLeaderboardKey(cityCode) {
  return cityCode ? `${DISTANCE_CITY_PREFIX}${cityCode.toLowerCase()}` : DISTANCE_GLOBAL_KEY;
}

/**
 * Get leaderboard (global Vietnam or city-specific).
 * @param {string|null} cityCode City code, or null for global.
 * @param {number} limit Number of entries to return.
 * @param {string} type 'score' (highest first) or 'distance' (lowest first).
 * @returns {Promise<Array>} Leaderboard entries.
 */
export async function getLeaderboard(cityCode = null, limit = 100, type = 'score') {
  try {
    const h = getUpstash();

    let leaderboardKey;
    if (type === 'distance') {
      leaderboardKey = getDistanceLeaderboardKey(cityCode);
    } else {
      leaderboardKey = cityCode ? getCityLeaderboardKey(cityCode) : GLOBAL_LEADERBOARD_KEY;
    }

    // Score leaderboards: REV=true (highest first). Distance: REV=false (lowest first).
    const rev = type === 'score';
    const leaderboardData = await zRangeWithScores(h, leaderboardKey, 0, limit - 1, rev);

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
 * Submit a score to both city and global score leaderboards.
 * @param {string} username Player username.
 * @param {number} score Score achieved (0-5).
 * @param {string} cityCode City code.
 * @returns {Promise<Object>} Submission result with both city and global ranks.
 */
export async function submitScore(username, score, cityCode) {
  try {
    const h = getUpstash();

    if (!username || score === undefined || !cityCode) {
      throw new Error('Missing required fields: username, score, cityCode');
    }

    const trimmedUsername = username.trim();
    const numScore = Number(score);

    const globalKey = GLOBAL_LEADERBOARD_KEY;
    const cityKey = getCityLeaderboardKey(cityCode);

    const [globalExisting, cityExisting] = await Promise.all([
      zScore(h, globalKey, trimmedUsername),
      zScore(h, cityKey, trimmedUsername),
    ]);

    const globalNewTotal = (globalExisting || 0) + numScore;
    const cityNewTotal = (cityExisting || 0) + numScore;

    await Promise.all([
      zAdd(h, globalKey, globalNewTotal, trimmedUsername),
      zAdd(h, cityKey, cityNewTotal, trimmedUsername),
    ]);

    // Trim to top MAX_LEADERBOARD_SIZE (highest scores). Sorted set is ascending,
    // so remove the lowest-ranked entries that fall outside the top window.
    await Promise.all([
      zRemRangeByRank(h, globalKey, 0, -(MAX_LEADERBOARD_SIZE + 1)),
      zRemRangeByRank(h, cityKey, 0, -(MAX_LEADERBOARD_SIZE + 1)),
    ]);

    const [globalRank, cityRank] = await Promise.all([
      zRevRank(h, globalKey, trimmedUsername),
      zRevRank(h, cityKey, trimmedUsername),
    ]);

    const actualGlobalRank = globalRank !== null ? globalRank + 1 : null;
    const actualCityRank = cityRank !== null ? cityRank + 1 : null;

    return {
      success: true,
      global: {
        username: trimmedUsername,
        score: Number(globalNewTotal),
        rank: actualGlobalRank,
      },
      city: {
        username: trimmedUsername,
        score: Number(cityNewTotal),
        rank: actualCityRank,
        cityCode: cityCode,
      },
      message: `Score added! City: ${cityNewTotal} (+${numScore}), Global: ${globalNewTotal} (+${numScore})`,
    };
  } catch (error) {
    console.error('Error submitting score:', error);
    throw new Error(error.message || 'Failed to submit score');
  }
}

/**
 * Submit a distance record to both city and global distance leaderboards.
 * @param {string} username Player username.
 * @param {number} distance Distance achieved in meters.
 * @param {string} cityCode City code.
 * @returns {Promise<Object>} Submission result with distance ranks.
 */
export async function submitDistanceRecord(username, distance, cityCode) {
  try {
    const h = getUpstash();

    if (!username || distance === undefined || !cityCode) {
      throw new Error('Missing required fields: username, distance, cityCode');
    }

    const trimmedUsername = username.trim();
    const numDistance = Number(distance);
    const timestamp = Date.now();

    // Unique entry id so each distance attempt gets its own slot.
    const entryId = `${trimmedUsername}:${numDistance}:${timestamp}`;

    const globalDistanceKey = getDistanceLeaderboardKey(null);
    const cityDistanceKey = getDistanceLeaderboardKey(cityCode);

    // Distance leaderboards: lower = better, so use distance directly as score.
    await Promise.all([
      zAdd(h, globalDistanceKey, numDistance, entryId),
      zAdd(h, cityDistanceKey, numDistance, entryId),
    ]);

    // Trim to top MAX_LEADERBOARD_SIZE (lowest distances). Sorted set is ascending,
    // so remove ranks beyond MAX_LEADERBOARD_SIZE (the worst entries).
    await Promise.all([
      zRemRangeByRank(h, globalDistanceKey, MAX_LEADERBOARD_SIZE, -1),
      zRemRangeByRank(h, cityDistanceKey, MAX_LEADERBOARD_SIZE, -1),
    ]);

    const [globalRank, cityRank] = await Promise.all([
      zRank(h, globalDistanceKey, entryId),
      zRank(h, cityDistanceKey, entryId),
    ]);

    const actualGlobalRank = globalRank !== null ? globalRank + 1 : null;
    const actualCityRank = cityRank !== null ? cityRank + 1 : null;

    return {
      success: true,
      globalDistance: {
        username: trimmedUsername,
        distance: numDistance,
        rank: actualGlobalRank,
      },
      cityDistance: {
        username: trimmedUsername,
        distance: numDistance,
        rank: actualCityRank,
        cityCode: cityCode,
      },
      message: `Distance record: ${numDistance}m`,
    };
  } catch (error) {
    console.error('Error submitting distance record:', error);
    throw new Error(error.message || 'Failed to submit distance record');
  }
}
