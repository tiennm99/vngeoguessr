"use client";

import { useEffect } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import {
  THEMES,
  DEFAULT_THEME,
  getStoredTheme,
  setStoredTheme,
  watchStoredTheme,
  applyTheme,
  watchSystemTheme,
} from '../../lib/theme';
import { useStoredValue } from '../../lib/use-stored-value';

// Lucide, matching the rest of the chrome's icon language (Trophy, Wrench,
// ArrowLeft ...); emoji ignored currentColor and read noisier than the rest.
const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/**
 * The three-way theme switch, or one cycling button where the header has no
 * room for three cells.
 * @param {Object} props
 * @param {string} [props.className]
 * @param {boolean} [props.compact] True for the single cycling button.
 */
export default function ThemeToggle({ className = '', compact = false }) {
  // The stored choice, read from storage and re-read whenever it changes --
  // including a change made by the other copy of this control (the header
  // mounts a breakpoint pair). null until the browser value is known, so the
  // server marks nothing selected rather than guessing.
  const theme = useStoredValue(getStoredTheme, watchStoredTheme, null);

  useEffect(() => {
    if (theme === null) return undefined;
    applyTheme(theme);
    if (theme !== 'system') return undefined;
    // Only while following the system does an OS change mean anything.
    return watchSystemTheme(() => applyTheme('system'));
  }, [theme]);

  // Writing storage is the whole update: every mounted toggle re-reads.
  const handleSelect = (choice) => setStoredTheme(choice);

  const groupClass = `inline-flex h-11 items-center rounded-lg border border-border bg-card ${className}`;

  if (compact) {
    // One cell that steps light -> dark -> system. Shows the CURRENT theme's
    // icon, so the button reads as a status as well as a control.
    const index = THEMES.findIndex((option) => option.value === (theme ?? DEFAULT_THEME));
    const current = THEMES[index === -1 ? 0 : index];
    const next = THEMES[(index + 1) % THEMES.length];
    const Icon = THEME_ICONS[current.value];
    // One control, so no group role: a group of one only adds a stop.
    return (
      <button
        type="button"
        aria-label={`Theme: ${current.label}. Switch to ${next.label}`}
        title={`Theme: ${current.label}`}
        onClick={() => handleSelect(next.value)}
        className={`flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 ${className}`}
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    // A plain group of toggle buttons rather than an ARIA radiogroup: a
    // radiogroup obliges roving tabindex and arrow-key navigation, and claiming
    // the role without honouring it is worse for screen reader users than not
    // claiming it. aria-pressed carries the selected state instead.
    <div
      role="group"
      aria-label="Colour theme"
      className={groupClass}
    >
      {THEMES.map((option) => {
        const selected = theme === option.value;
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
