// Last-played region code in localStorage, mirroring username.js: one module
// owns one browser-storage concern, so nothing server-side ever touches window.

import { readItem, writeItem, watchItem } from './storage.js';

export const LAST_REGION_STORAGE_KEY = 'vngeoguessr_last_region';

export function getLastRegion() {
  return readItem(LAST_REGION_STORAGE_KEY);
}

export function setLastRegion(code) {
  writeItem(LAST_REGION_STORAGE_KEY, code);
}

export function watchLastRegion(onChange) {
  return watchItem(LAST_REGION_STORAGE_KEY, onChange);
}
