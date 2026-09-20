import { describe, it, expect } from 'vitest';
import { nextStreak, currentStreak } from '../src/lib/daily-progress.js';

// The streak rule, without a browser: the day after the last play extends it,
// the same day keeps it, any gap restarts it.
describe('daily streak', () => {
  const played = (day, streak) => ({ day, streak });

  it('starts at one with no history', () => {
    expect(nextStreak(null, '2026-09-21')).toBe(1);
  });

  it('extends across consecutive days and keeps within a day', () => {
    expect(nextStreak(played('2026-09-20', 3), '2026-09-21')).toBe(4);
    expect(nextStreak(played('2026-09-21', 4), '2026-09-21')).toBe(4);
  });

  it('restarts after a missed day', () => {
    expect(nextStreak(played('2026-09-19', 7), '2026-09-21')).toBe(1);
  });

  it('shows a streak only while it is still alive', () => {
    expect(currentStreak(null, '2026-09-21')).toBe(0);
    expect(currentStreak(played('2026-09-21', 2), '2026-09-21')).toBe(2);
    expect(currentStreak(played('2026-09-20', 2), '2026-09-21')).toBe(2);
    expect(currentStreak(played('2026-09-18', 9), '2026-09-21')).toBe(0);
  });
});
