// Player name in localStorage, mirroring theme.js: one module owns one
// browser-storage concern, so server code importing lib/game.js for scoring
// never touches window.

export const USERNAME_STORAGE_KEY = 'vngeoguessr_username';

export function getUsername() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USERNAME_STORAGE_KEY);
}

export function setUsername(username) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USERNAME_STORAGE_KEY, username);
}

/**
 * A name for a player who skipped choosing one. Must satisfy the same rules
 * the modal enforces (2-20 chars of [a-zA-Z0-9_-]), because once generated it
 * is stored and edited exactly like a typed name.
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
