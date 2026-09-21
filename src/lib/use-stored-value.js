"use client";

import { useSyncExternalStore } from 'react';

/**
 * Render a browser-stored value and re-render when it changes.
 *
 * Built on useSyncExternalStore, which is what a preference in localStorage
 * is: state owned outside React. The server, and the client during hydration,
 * see `serverValue`; the client then reads the real value and re-renders once.
 * That replaces the read-in-an-effect-then-setState pattern, which painted a
 * default first and corrected it a frame later, and left two copies of one
 * control (a breakpoint pair) free to disagree.
 *
 * `read` must return the same value for the same stored contents -- a string,
 * a number, or a cached object -- or the store will loop.
 * @template T
 * @param {() => T} read The module's getter.
 * @param {(onChange: Function) => Function} watch The module's watcher.
 * @param {T} serverValue What to render before the browser value is known.
 * @returns {T}
 */
export function useStoredValue(read, watch, serverValue) {
  return useSyncExternalStore(watch, read, () => serverValue);
}
