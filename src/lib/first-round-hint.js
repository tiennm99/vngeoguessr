// Whether the one-time how-to-play hint has been seen, in localStorage,
// mirroring username.js: one module owns one browser-storage concern.

import { readItem, writeItem, watchItem } from './storage.js';

export const HINT_STORAGE_KEY = 'vngeoguessr_hint_seen';

export function getHintSeen() {
  return readItem(HINT_STORAGE_KEY) === '1';
}

export function setHintSeen() {
  writeItem(HINT_STORAGE_KEY, '1');
}

export function watchHintSeen(onChange) {
  return watchItem(HINT_STORAGE_KEY, onChange);
}
