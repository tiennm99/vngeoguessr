import { Redis } from '@upstash/redis';

// Upstash Redis adapter (REST SDK).
//
// Logical key namespace (callers pass these unprefixed):
//   session:{sessionId}              string, TTL 30 min
//   leaderboard:vietnam              sorted set (score)
//   leaderboard:city:{cityCode}      sorted set (score)
//   distance:vietnam                 sorted set (distance)
//   distance:city:{cityCode}         sorted set (distance)
//
// Multi-tenancy: every physical Upstash key carries KEY_PREFIX (default
// 'vngeoguessr:') so this project can safely share an Upstash DB with other
// Vercel projects without key collisions. Prefix applied transparently here;
// callers never see it.

const DEFAULT_KEY_PREFIX = 'vngeoguessr:';

let handle = null;

/**
 * Get the global Upstash handle (singleton).
 * Accepts either UPSTASH_REDIS_REST_URL/_TOKEN (vanilla Upstash) or
 * KV_REST_API_URL/_TOKEN (Vercel Marketplace integration alias).
 * @returns {{ client: Redis, prefix: string }}
 */
export function getUpstash() {
  if (handle) return handle;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url) throw new Error('UPSTASH_REDIS_REST_URL or KV_REST_API_URL is required');
  if (!token) throw new Error('UPSTASH_REDIS_REST_TOKEN or KV_REST_API_TOKEN is required');
  const client = new Redis({ url, token });
  const prefix = process.env.KEY_PREFIX ?? DEFAULT_KEY_PREFIX;
  handle = { client, prefix };
  return handle;
}

// Build the physical Upstash key from a logical key by prepending the prefix.
function pkey(h, key) {
  return `${h.prefix}${key}`;
}

/**
 * Read a JSON value. Returns null if key missing.
 * @param {{ client: Redis, prefix: string }} h
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export async function getJson(h, key) {
  const value = await h.client.get(pkey(h, key));
  if (value == null) return null;
  // Upstash SDK auto-parses JSON in some versions, returns string in others.
  return typeof value === 'string' ? JSON.parse(value) : value;
}

/**
 * Write a JSON value with optional TTL (seconds).
 * @param {{ client: Redis, prefix: string }} h
 * @param {string} key
 * @param {any} value
 * @param {number|null} ttlSeconds Optional TTL in seconds.
 * @returns {Promise<void>}
 */
export async function putJson(h, key, value, ttlSeconds) {
  const setOpts = ttlSeconds != null ? { ex: ttlSeconds } : undefined;
  await h.client.set(pkey(h, key), JSON.stringify(value), setOpts);
}

/**
 * Delete a key.
 * @param {{ client: Redis, prefix: string }} h
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function del(h, key) {
  await h.client.del(pkey(h, key));
}

/**
 * Add a single member with score to a sorted set.
 * @param {{ client: Redis, prefix: string }} h
 * @param {string} key
 * @param {number} score
 * @param {string} member
 * @returns {Promise<void>}
 */
export async function zAdd(h, key, score, member) {
  await h.client.zadd(pkey(h, key), { score, member });
}

/**
 * Get a member's score, or null if absent.
 * @param {{ client: Redis, prefix: string }} h
 * @param {string} key
 * @param {string} member
 * @returns {Promise<number|null>}
 */
export async function zScore(h, key, member) {
  const result = await h.client.zscore(pkey(h, key), member);
  return result == null ? null : Number(result);
}

/**
 * Range query on a sorted set, returning [{ value, score }, ...].
 * @param {{ client: Redis, prefix: string }} h
 * @param {string} key
 * @param {number} start
 * @param {number} stop
 * @param {boolean} rev True for descending (highest score first).
 * @returns {Promise<Array<{value: string, score: number}>>}
 */
export async function zRangeWithScores(h, key, start, stop, rev) {
  const raw = await h.client.zrange(pkey(h, key), start, stop, {
    rev,
    withScores: true,
  });
  return reshapeWithScores(raw);
}

/**
 * Get a member's rank (ascending order). Null if absent.
 * @param {{ client: Redis, prefix: string }} h
 * @param {string} key
 * @param {string} member
 * @returns {Promise<number|null>}
 */
export async function zRank(h, key, member) {
  const result = await h.client.zrank(pkey(h, key), member);
  return result == null ? null : Number(result);
}

/**
 * Get a member's rank (descending order). Null if absent.
 * @param {{ client: Redis, prefix: string }} h
 * @param {string} key
 * @param {string} member
 * @returns {Promise<number|null>}
 */
export async function zRevRank(h, key, member) {
  const result = await h.client.zrevrank(pkey(h, key), member);
  return result == null ? null : Number(result);
}

/**
 * Trim a sorted set to a rank range.
 * @param {{ client: Redis, prefix: string }} h
 * @param {string} key
 * @param {number} start
 * @param {number} stop
 * @returns {Promise<number>} Number of removed members.
 */
export async function zRemRangeByRank(h, key, start, stop) {
  return await h.client.zremrangebyrank(pkey(h, key), start, stop);
}

// Normalize the two shapes Upstash SDK may return for zrange + withScores:
//   newer: [{ score, member }, ...]
//   older: [member, score, member, score, ...]
function reshapeWithScores(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === 'object' && raw[0] !== null && 'member' in raw[0]) {
    return raw.map((entry) => ({ value: entry.member, score: Number(entry.score) }));
  }
  const out = [];
  for (let i = 0; i < raw.length; i += 2) {
    out.push({ value: raw[i], score: Number(raw[i + 1]) });
  }
  return out;
}
