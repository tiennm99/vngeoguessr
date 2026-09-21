// Player name in localStorage, mirroring theme.js: one module owns one
// browser-storage concern, so server code importing lib/game.js for scoring
// never touches window.

import { readItem, writeItem, watchItem } from './storage.js';

export const USERNAME_STORAGE_KEY = 'vngeoguessr_username';

/** The stored name, or '' when there is none. Never throws. */
export function getUsername() {
  return readItem(USERNAME_STORAGE_KEY) ?? '';
}

export function setUsername(username) {
  writeItem(USERNAME_STORAGE_KEY, username);
}

/** Be told when the name changes, here or in another tab. */
export function watchUsername(onChange) {
  return watchItem(USERNAME_STORAGE_KEY, onChange);
}

export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 20;

// Letters and digits from any script, plus hyphen and underscore. Unicode
// classes rather than [a-zA-Z] so a Vietnamese player can be "Tiến" on the
// board of a game about Vietnamese streets. Whitespace and ':' stay out: the
// distance boards pack `username:distance:timestamp` into one member and split
// it on ':' when read, so a colon in a name would corrupt every record.
const USERNAME_PATTERN = /^[\p{L}\p{N}_-]+$/u;

/**
 * Check a username the way both the modal and /api/guess must agree on.
 *
 * One rule in one place: the browser used to be the only validator, so a
 * request built by hand could put any string of any length onto the boards.
 * @param {unknown} raw The name as typed or as received.
 * @returns {{ ok: boolean, value: string, error: string|null }} The trimmed
 *   name when ok, otherwise the message to show.
 */
export function validateUsername(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, value: '', error: 'Please enter a username' };
  }
  const value = raw.trim();
  if (!value) return { ok: false, value, error: 'Please enter a username' };
  if (value.length < USERNAME_MIN_LENGTH) {
    return { ok: false, value, error: `Username must be at least ${USERNAME_MIN_LENGTH} characters` };
  }
  if (value.length > USERNAME_MAX_LENGTH) {
    return { ok: false, value, error: `Username must be at most ${USERNAME_MAX_LENGTH} characters` };
  }
  if (!USERNAME_PATTERN.test(value)) {
    return {
      ok: false,
      value,
      error: 'Username can only contain letters, numbers, hyphens, and underscores',
    };
  }
  return { ok: true, value, error: null };
}

/**
 * A name for a player who skipped choosing one. Must satisfy validateUsername,
 * because once generated it is stored and edited exactly like a typed name.
 * Six suffix chars: the name is the leaderboard's member key, so a collision
 * silently merges two players' totals -- 36^6 keeps that out of birthday-odds
 * range at any plausible player count.
 * @returns {string} e.g. "Player-x7k2m9"
 */
export function generateRandomUsername() {
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += Math.floor(Math.random() * 36).toString(36);
  }
  return `Player-${suffix}`;
}
