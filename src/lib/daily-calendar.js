// Which day "today's" daily challenge belongs to, and its running number.
//
// Client-safe: pure date arithmetic, so the home page and the server agree on
// the day without a request. Days roll over at midnight in Vietnam (UTC+7),
// not UTC: the game is about Vietnamese streets and most players are there, so
// the new challenge appears with the new day rather than at seven in the
// morning. The daily statistics keep UTC days; they are a different concern.

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Day #1. Earlier days have no number and never had a challenge.
export const DAILY_EPOCH = '2026-09-20';

/**
 * The daily-challenge day a timestamp falls in, as 'YYYY-MM-DD' in Vietnam time.
 * @param {number} [now] Epoch ms; defaults to the current time.
 * @returns {string}
 */
export function dailyDay(now = Date.now()) {
  return new Date(now + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The day before a 'YYYY-MM-DD' day.
 * @param {string} day
 * @returns {string}
 */
export function previousDay(day) {
  return new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/**
 * The challenge number of a day: 1 on the epoch day, counting up.
 * @param {string} day 'YYYY-MM-DD'.
 * @returns {number}
 */
export function dailyNumber(day) {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${DAILY_EPOCH}T00:00:00Z`)) / DAY_MS) + 1;
}
