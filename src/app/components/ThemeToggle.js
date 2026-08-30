"use client";

import { useEffect, useState } from 'react';
import {
  THEMES,
  DEFAULT_THEME,
  getStoredTheme,
  setStoredTheme,
  applyTheme,
  watchSystemTheme,
} from '../../lib/theme';

export default function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  // The stored choice only exists on the client, so the first paint has to
  // match the server's default and correct itself after mount.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getStoredTheme());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme);
    if (theme !== 'system') return;
    // Only while following the system does an OS change mean anything.
    return watchSystemTheme(() => applyTheme('system'));
  }, [theme, mounted]);

  const handleSelect = (choice) => {
    setTheme(choice);
    setStoredTheme(choice);
  };

  return (
    // A plain group of toggle buttons rather than an ARIA radiogroup: a
    // radiogroup obliges roving tabindex and arrow-key navigation, and claiming
    // the role without honouring it is worse for screen reader users than not
    // claiming it. aria-pressed carries the selected state instead.
    <div
      role="group"
      aria-label="Colour theme"
      className={`inline-flex h-11 items-center rounded-lg border border-border bg-card ${className}`}
    >
      {THEMES.map((option) => {
        const selected = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => handleSelect(option.value)}
            className={`flex h-11 w-9 items-center justify-center rounded-lg text-base leading-none outline-none transition-[background-color,opacity] focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
              selected ? 'bg-brand shadow-sm' : 'opacity-55 hover:opacity-100 hover:bg-muted'
            }`}
          >
            {/* Emoji ignore currentColor, so the selected state cannot be
                carried by text colour. Opacity gives a cue that works on a
                glyph the palette cannot reach. */}
            <span aria-hidden="true">{option.emoji}</span>
          </button>
        );
      })}
    </div>
  );
}
