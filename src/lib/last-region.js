// Last-played region code in localStorage, mirroring username.js: one module
// owns one browser-storage concern, so nothing server-side ever touches window.

export const LAST_REGION_STORAGE_KEY = 'vngeoguessr_last_region';

export function getLastRegion() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(LAST_REGION_STORAGE_KEY);
  } catch {
    // Storage can throw (blocked site data, some private windows). No stored
    // region is a fine answer.
    return null;
  }
}

export function setLastRegion(code) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_REGION_STORAGE_KEY, code);
  } catch {
    // Best-effort convenience; losing it costs one extra click.
  }
}
