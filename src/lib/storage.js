// The one place localStorage is touched.
//
// Every per-browser preference (name, theme, sound, last region, daily
// record, hint seen) has its own module that owns its key, its validation and
// its serialisation. Those modules come here for the three things they all
// need and none should re-implement: a read that never throws, a write that
// never throws, and a way to be told when the value changes.
//
// Reads and writes are guarded because storage is not always there: private
// windows, blocked site data and thumbnail renderers all throw on access, and
// a preference that cannot be remembered must never take the page down.
//
// Change notification covers both tabs and this one. The browser's `storage`
// event fires only in OTHER tabs, so a same-tab write also dispatches on a
// local target; two copies of one control on the same page (a breakpoint
// pair, one hidden) stay in step that way.

const local = typeof EventTarget === 'undefined' ? null : new EventTarget();

/**
 * Read a raw string, or null when absent or unreadable.
 * @param {string} key
 * @returns {string|null}
 */
export function readItem(key) {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Write a raw string (or remove the key with null), then notify watchers.
 * @param {string} key
 * @param {string|null} value
 * @returns {void}
 */
export function writeItem(key, value) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Best effort: the caller's in-memory state still applies for this visit.
  }
  local?.dispatchEvent(new CustomEvent('change', { detail: key }));
}

/**
 * Be told when a key changes, in this tab or another.
 * @param {string} key
 * @param {Function} onChange Called with no arguments; re-read the value.
 * @returns {Function} Unsubscribe.
 */
export function watchItem(key, onChange) {
  if (typeof window === 'undefined') return () => {};
  const onLocal = (event) => {
    if (event.detail === key) onChange();
  };
  const onStorage = (event) => {
    if (event.key === key || event.key === null) onChange();
  };
  local?.addEventListener('change', onLocal);
  window.addEventListener('storage', onStorage);
  return () => {
    local?.removeEventListener('change', onLocal);
    window.removeEventListener('storage', onStorage);
  };
}
