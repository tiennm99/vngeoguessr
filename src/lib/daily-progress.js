import { previousDay } from './daily-calendar.js';
import { readItem, writeItem, watchItem } from './storage.js';

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

// The last raw string parsed and what it parsed to. useSyncExternalStore
// compares snapshots by identity, so the same stored text must yield the same
// object, not a fresh parse every read.
let cachedRaw = null;
let cachedProgress = null;

/** @returns {DailyProgress|null} */
export function getDailyProgress() {
  const raw = readItem(DAILY_STORAGE_KEY);
  if (raw === cachedRaw) return cachedProgress;
  cachedRaw = raw;
  try {
    cachedProgress = raw ? JSON.parse(raw) : null;
  } catch {
    cachedProgress = null;
  }
  return cachedProgress;
}

/** Be told when the record changes. */
export function watchDailyProgress(onChange) {
  return watchItem(DAILY_STORAGE_KEY, onChange);
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
  // Best effort: if storage refuses, the player may get to play today twice.
  writeItem(DAILY_STORAGE_KEY, JSON.stringify(progress));
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
