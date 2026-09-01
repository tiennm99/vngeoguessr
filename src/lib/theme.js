// Theme selection: an explicit light/dark choice, or following the OS.
//
// The resolved theme is expressed as a `dark` class on <html>, which is what
// the `dark` custom variant in globals.css keys off, so Tailwind's dark:
// utilities and the token palette switch together. layout.js runs an inlined
// copy of resolveDark before paint; keep the two in step.

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
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.some((theme) => theme.value === stored) ? stored : DEFAULT_THEME;
  } catch {
    // Private browsing and blocked site data both throw here; following the
    // system is a fine answer when the choice cannot be read.
    return DEFAULT_THEME;
  }
}

/**
 * Persist a theme choice.
 * @param {string} choice 'light', 'dark' or 'system'.
 * @returns {void}
 */
export function setStoredTheme(choice) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Not being able to remember the choice must not break changing it.
  }
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
 * Watch the OS preference. The callback fires only while following the system.
 * @param {Function} onChange Called when the OS preference flips.
 * @returns {Function} Unsubscribe.
 */
export function watchSystemTheme(onChange) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
