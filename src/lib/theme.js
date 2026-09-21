// Theme selection: an explicit light/dark choice, or following the OS.
//
// The resolved theme is expressed as a `dark` class on <html>, which is what
// the `dark` custom variant in globals.css keys off, so Tailwind's dark:
// utilities and the token palette switch together. layout.js runs an inlined
// copy of resolveDark before paint; keep the two in step.

import { readItem, writeItem, watchItem } from './storage.js';

export const THEME_STORAGE_KEY = 'vngeoguessr_theme';
export const DEFAULT_THEME = 'system';

// Icons live with the toggle component (Lucide, following currentColor);
// this module stays free of UI imports.
export const THEMES = [
  { value: 'light', label: 'Light theme' },
  { value: 'dark', label: 'Dark theme' },
  { value: 'system', label: 'Match system theme' },
];

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Read the stored choice, falling back to following the system.
 * @returns {string} 'light', 'dark' or 'system'.
 */
export function getStoredTheme() {
  const stored = readItem(THEME_STORAGE_KEY);
  return THEMES.some((theme) => theme.value === stored) ? stored : DEFAULT_THEME;
}

/**
 * Persist a theme choice.
 * @param {string} choice 'light', 'dark' or 'system'.
 * @returns {void}
 */
export function setStoredTheme(choice) {
  writeItem(THEME_STORAGE_KEY, choice);
}

/**
 * Be told when the stored choice changes. Every mounted toggle subscribes, so
 * a breakpoint pair of them never disagrees after a click.
 * @param {Function} onChange
 * @returns {Function} Unsubscribe.
 */
export function watchStoredTheme(onChange) {
  return watchItem(THEME_STORAGE_KEY, onChange);
}

/**
 * Resolve a choice to whether dark should be shown right now.
 * @param {string} choice 'light', 'dark' or 'system'.
 * @returns {boolean} True when the dark palette applies.
 */
export function resolveDark(choice) {
  if (choice === 'dark') return true;
  if (choice === 'light') return false;
  return window.matchMedia(DARK_QUERY).matches;
}

/**
 * Apply a theme choice to the document.
 * @param {string} choice 'light', 'dark' or 'system'.
 * @returns {void}
 */
export function applyTheme(choice) {
  const dark = resolveDark(choice);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  // Tells the browser which palette to use for scrollbars, form controls and
  // the caret, which CSS variables alone cannot reach.
  root.style.colorScheme = dark ? 'dark' : 'light';
}

/**
 * Watch the OS preference. Fires on every OS flip regardless of the stored
 * choice -- gating on 'system' is the caller's job, and a caller that instead
 * re-applies getStoredTheme() is safe because that is a no-op for an explicit
 * light or dark.
 * @param {Function} onChange Called when the OS preference flips.
 * @returns {Function} Unsubscribe.
 */
export function watchSystemTheme(onChange) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
