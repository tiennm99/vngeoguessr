import { getUpstash, hIncrBy, hGetAllNumbers, pfAdd, pfCount, expire, scanKeys } from './upstash.js';

// Daily play counters, the one measurement the game keeps about itself.
//
// Two keys per UTC day: a hash of round counts keyed `{level}:{score}` -- the
// level of the region the player PICKED (country, province, district) and the
// points the round earned -- and a HyperLogLog of anonymous player ids. Between
// them they answer rounds/day, distinct players/day, rounds per player, the
// share of rounds scoring zero at each level, and (by counting the union of
// several days against their sum) how many players come back. Nothing here is
// per player: the HyperLogLog cannot be read back, only counted.
//
// Cost: two commands per round, plus an EXPIRE on each key the first time a
// new field appears that day. Both keys expire after STATS_TTL_DAYS.

const STATS_PREFIX = 'stats:';
const PLAYERS_PREFIX = 'stats:players:';
export const STATS_TTL_DAYS = 90;
const STATS_TTL_SECONDS = STATS_TTL_DAYS * 24 * 60 * 60;

/**
 * The UTC calendar day a timestamp falls in.
 * @param {number} [now] Epoch ms; defaults to the current time.
 * @returns {string} 'YYYY-MM-DD'.
 */
export function statsDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

/** Logical key of a day's round-count hash. */
export function statsKey(day) {
  return `${STATS_PREFIX}${day}`;
}

/** Logical key of a day's distinct-player HyperLogLog. */
export function playersKey(day) {
  return `${PLAYERS_PREFIX}${day}`;
}

/**
 * Count one completed round.
 *
 * Throws on a store failure; the route decides whether that matters (it does
 * not -- a lost tally must never cost a player their round).
 * @param {string} level Level of the region the player picked.
 * @param {number} score Points the round earned, 0-5.
 * @param {string|null} playerId Anonymous player id, or null when the request had none.
 * @param {number} [now] Epoch ms, for tests.
 * @returns {Promise<void>}
 */
export async function recordRound(level, score, playerId, now = Date.now()) {
  const h = getUpstash();
  const day = statsDay(now);
  const field = `${level}:${score}`;

  const count = await hIncrBy(h, statsKey(day), field, 1);
  // A count of 1 means this field did not exist a moment ago: either the day
  // just began, or a level/score pair is appearing for the first time today. Set
  // the TTL on both keys then. Each day has at most 18 distinct fields, so this
  // is at most 18 extra commands a day rather than two more per round.
  if (count === 1) {
    await expire(h, statsKey(day), STATS_TTL_SECONDS);
  }

  if (playerId) {
    await pfAdd(h, playersKey(day), playerId);
    if (count === 1) await expire(h, playersKey(day), STATS_TTL_SECONDS);
  }
}

/**
 * The days that have any statistics, oldest first.
 * @returns {Promise<string[]>} 'YYYY-MM-DD' values.
 */
export async function statsDays() {
  const h = getUpstash();
  const keys = await scanKeys(h, `${STATS_PREFIX}????-??-??`);
  return keys.map((key) => key.slice(STATS_PREFIX.length)).sort();
}

/**
 * One day's numbers.
 * @param {string} day 'YYYY-MM-DD'.
 * @returns {Promise<{day: string, rounds: number, players: number, byLevel: Record<string, {rounds: number, zero: number}>}>}
 */
export async function readDay(day) {
  const h = getUpstash();
  const fields = await hGetAllNumbers(h, statsKey(day));
  const byLevel = {};
  let rounds = 0;
  for (const [field, count] of Object.entries(fields)) {
    const [level, score] = field.split(':');
    byLevel[level] ??= { rounds: 0, zero: 0 };
    byLevel[level].rounds += count;
    if (score === '0') byLevel[level].zero += count;
    rounds += count;
  }
  const players = await pfCount(h, [playersKey(day)]);
  return { day, rounds, players, byLevel };
}

/**
 * Distinct players across several days, for a repeat-visit estimate: the sum
 * of daily counts minus this union is the number of returning player-days.
 * @param {string[]} days 'YYYY-MM-DD' values.
 * @returns {Promise<number>}
 */
export async function distinctPlayersAcross(days) {
  const h = getUpstash();
  return pfCount(h, days.map(playersKey));
}
