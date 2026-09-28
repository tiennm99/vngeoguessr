"use client";

import { useEffect } from 'react';
import { getStoredTheme, watchStoredTheme, applyTheme, watchSystemTheme } from '../../lib/theme';
import { useStoredValue } from '../../lib/use-stored-value';

/**
 * Keeps the document's theme in step with the stored choice and, while that
 * choice is 'system', with the OS. Mounted once in the root layout, so the
 * theme follows on every page -- not only where a toggle happens to be -- and
 * an OS flip is applied once rather than once per mounted toggle. The toggles
 * only write the choice. The first paint is the inline script in layout.js.
 * @returns {null}
 */
export default function ThemeSync() {
  const theme = useStoredValue(getStoredTheme, watchStoredTheme, null);

  useEffect(() => {
    if (theme === null) return undefined;
    applyTheme(theme);
    if (theme !== 'system') return undefined;
    return watchSystemTheme(() => applyTheme('system'));
  }, [theme]);

  return null;
}
