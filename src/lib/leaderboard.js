import { createClient } from 'redis';

// Redis client setup
let redisClient = null;

export async function getRedisClient() {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not set');
    }
    
    redisClient = createClient({
      url: redisUrl
    });
    
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
    
    redisClient.on('connect', () => {
      console.log('Redis client connected');
    });
    
    redisClient.on('disconnect', () => {
      console.log('Redis client disconnected');
    });
    
    await redisClient.connect();
  }
  
  return redisClient;
}

// Global Vietnam leaderboard constants
const LEADERBOARD_KEY = 'leaderboard:vietnam';
const MAX_LEADERBOARD_SIZE = 200;

/**
 * Get the global Vietnam leaderboard
 * @param {number} limit - Number of entries to return (default: 100)
 * @returns {Promise<Array>} Array of leaderboard entries
 */
export async function getLeaderboard(limit = 100) {
  try {
    const redis = await getRedisClient();
    
    // Get top entries from the sorted set (highest scores first)
    const leaderboardData = await redis.zRevRangeWithScores(LEADERBOARD_KEY, 0, limit - 1);
    
    const entries = [];
    
    // Process each entry (leaderboardData is [member, score, member, score, ...])
    for (let i = 0; i < leaderboardData.length; i += 2) {
      const username = leaderboardData[i];
      const score = leaderboardData[i + 1];
      
      entries.push({
        username,
        score: Number(score),
        rank: Math.floor(i / 2) + 1 // Calculate rank based on position
      });
    }
    
    return entries;
    
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    throw new Error('Failed to fetch leaderboard');
  }
}

/**
 * Submit a score to the global Vietnam leaderboard
 * @param {string} username - Player username  
 * @param {number} score - Score achieved (0-5)
 * @returns {Promise<Object>} Submission result with rank
 */
export async function submitScore(username, score) {
  try {
    const redis = await getRedisClient();
    
    // Validate input
    if (!username || score === undefined) {
      throw new Error('Missing required fields: username, score');
    }
    
    const trimmedUsername = username.trim();
    const numScore = Number(score);
    
    // Check if user already exists in leaderboard
    const existingScore = await redis.zScore(LEADERBOARD_KEY, trimmedUsername);
    
    // Only update if new score is higher
    if (existingScore === null || numScore > existingScore) {
      // Add or update user's score in the leaderboard
      await redis.zAdd(LEADERBOARD_KEY, {
        score: numScore,
        value: trimmedUsername
      });
      
      // Keep only top 200 entries to manage storage
      await redis.zRemRangeByRank(LEADERBOARD_KEY, 0, -(MAX_LEADERBOARD_SIZE + 1));
    }
    
    // Calculate current rank
    const rank = await redis.zRevRank(LEADERBOARD_KEY, trimmedUsername);
    const actualRank = rank !== null ? rank + 1 : null;
    const finalScore = await redis.zScore(LEADERBOARD_KEY, trimmedUsername);
    
    return {
      success: true,
      entry: { 
        username: trimmedUsername, 
        score: Number(finalScore),
        rank: actualRank 
      },
      message: numScore > (existingScore || 0) ? 'New high score!' : 'Score submitted'
    };
    
  } catch (error) {
    console.error('Error submitting score:', error);
    throw new Error(error.message || 'Failed to submit score');
  }
}


/**
 * Close Redis connection (for cleanup)
 */
export async function closeRedisConnection() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}