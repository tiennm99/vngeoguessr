import { describe, it, expect } from 'vitest';
import { readItem, writeItem, watchItem } from '../src/lib/storage.js';
import { getUsername, setUsername } from '../src/lib/username.js';
import { getStoredTheme, DEFAULT_THEME } from '../src/lib/theme.js';
import { getDailyProgress } from '../src/lib/daily-progress.js';

// Vitest runs these in Node, where there is no window: exactly the situation
// server rendering is in, and the one every storage read has to survive.
describe('browser storage without a browser', () => {
  it('reads as absent and writes as a no-op instead of throwing', () => {
    expect(readItem('anything')).toBeNull();
    expect(() => writeItem('anything', 'x')).not.toThrow();
    expect(typeof watchItem('anything', () => {})).toBe('function');
  });

  it('gives every module its server default', () => {
    expect(getUsername()).toBe('');
    expect(() => setUsername('mai')).not.toThrow();
    expect(getStoredTheme()).toBe(DEFAULT_THEME);
    expect(getDailyProgress()).toBeNull();
  });
});
