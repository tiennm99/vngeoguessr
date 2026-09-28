import { describe, it, expect, vi } from 'vitest';
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

// A private window or blocked site data: every access throws.
describe('browser storage that refuses access', () => {
  it('keeps a refused write for the rest of the visit', async () => {
    vi.resetModules();
    const blocked = () => { throw new Error('blocked'); };
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
    try {
      const storage = await import('../src/lib/storage.js');
      expect(storage.readItem('k')).toBeNull();
      storage.writeItem('k', 'v');
      expect(storage.readItem('k')).toBe('v');
      storage.writeItem('k', null);
      expect(storage.readItem('k')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
