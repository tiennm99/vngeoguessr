import { previousDay } from './daily-calendar.js';

// The player's daily-challenge record in localStorage, mirroring username.js:
// one module owns one browser-storage concern.
//
// This is the only place a daily attempt is remembered. There is no server
// record and no daily board (see lib/daily.js), so a player who clears storage
// simply gets to play again -- the intended trade for zero cost and zero
// identity.

export const DAILY_STORAGE_KEY = 'vngeoguessr_daily';

/**
 * @typedef {Object} DailyProgress
 * @property {string} day The day last played, 'YYYY-MM-DD'.
 * @property {number} number That day's challenge number.
 * @property {number} streak Consecutive days played, including `day`.
 * @property {Object} result The round result as the dialog rendered it.
 * @property {number[]} guessCoordinates [lat, lng] the player guessed.
 * @property {string} imageUrl The panorama, so the result can be shown again.
 * @property {boolean} isPano Whether it renders in the 360 viewer or flat.
 */

/** @returns {DailyProgress|null} */
export function getDailyProgress() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DAILY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * The streak a play on `day` produces, given what was stored before.
 * Pure, so the rule is testable without a browser: a play the day after the
 * last one extends the streak, the same day keeps it, anything else restarts.
 * @param {DailyProgress|null} previous
 * @param {string} day
 * @returns {number}
 */
export function nextStreak(previous, day) {
  if (!previous) return 1;
  if (previous.day === day) return previous.streak;
  if (previous.day === previousDay(day)) return previous.streak + 1;
  return 1;
}

/**
 * Record today's finished round.
 * @param {string} day
 * @param {number} number
 * @param {Object} result
 * @param {number[]} guessCoordinates
 * @param {string} imageUrl
 * @param {boolean} isPano
 * @returns {DailyProgress} What was stored.
 */
export function saveDailyResult(day, number, result, guessCoordinates, imageUrl, isPano) {
  const previous = getDailyProgress();
  const progress = {
    day,
    number,
    streak: nextStreak(previous, day),
    result,
    guessCoordinates,
    imageUrl,
    isPano: isPano !== false,
  };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // Best-effort: losing it means the player may play today twice.
    }
  }
  return progress;
}

/**
 * The streak to show before today's play: still counting if the last play was
 * today or yesterday, otherwise broken.
 * @param {DailyProgress|null} progress
 * @param {string} today
 * @returns {number}
 */
export function currentStreak(progress, today) {
  if (!progress) return 0;
  if (progress.day === today || progress.day === previousDay(today)) return progress.streak;
  return 0;
}
