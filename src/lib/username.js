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
