import { getUpstash, getJson, putJson, del } from './upstash.js';

// Game session constants
const SESSION_KEY_PREFIX = 'session:';
const SESSION_EXPIRY = 30 * 60; // 30 minutes in seconds

/**
 * Store a game session in Upstash.
 * @param {string} sessionId Unique session identifier.
 * @param {Object} sessionData Session data to store.
 * @returns {Promise<boolean>} Success status.
 */
export async function storeGameSession(sessionId, sessionData) {
  try {
    const h = getUpstash();
    const key = SESSION_KEY_PREFIX + sessionId;
    await putJson(h, key, sessionData, SESSION_EXPIRY);
    return true;
  } catch (error) {
    console.error('Error storing game session:', error);
    throw error;
  }
}

/**
 * Retrieve a game session from Upstash.
 * @param {string} sessionId Session identifier.
 * @returns {Promise<Object|null>} Session data or null if not found.
 */
export async function getGameSession(sessionId) {
  try {
    const h = getUpstash();
    const key = SESSION_KEY_PREFIX + sessionId;
    return await getJson(h, key);
  } catch (error) {
    console.error('Error retrieving game session:', error);
    throw error;
  }
}

/**
 * Delete a game session from Upstash.
 * @param {string} sessionId Session identifier.
 * @returns {Promise<boolean>} Success status.
 */
export async function deleteGameSession(sessionId) {
  try {
    const h = getUpstash();
    const key = SESSION_KEY_PREFIX + sessionId;
    await del(h, key);
    return true;
  } catch (error) {
    console.error('Error deleting game session:', error);
    throw error;
  }
}
