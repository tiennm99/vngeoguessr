"use client";

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import {
  THEMES,
  DEFAULT_THEME,
  getStoredTheme,
  setStoredTheme,
  applyTheme,
  watchSystemTheme,
} from '../../lib/theme';

// Lucide, matching the rest of the chrome's icon language (Trophy, Wrench,
// ArrowLeft ...); emoji ignored currentColor and read noisier than the rest.
const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

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
        const Icon = THEME_ICONS[option.value];
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => handleSelect(option.value)}
            className={`flex h-11 w-11 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
              selected
                ? 'bg-brand text-brand-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
