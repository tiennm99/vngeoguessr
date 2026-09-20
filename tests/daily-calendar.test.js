import { describe, it, expect } from 'vitest';
import { dailyDay, previousDay, dailyNumber, isDay, DAILY_EPOCH } from '../src/lib/daily-calendar.js';

describe('daily calendar', () => {
  it('rolls the day over at midnight in Vietnam, not UTC', () => {
    // 16:59 UTC on the 20th is 23:59 in Vietnam; one minute later is the 21st.
    expect(dailyDay(Date.UTC(2026, 8, 20, 16, 59))).toBe('2026-09-20');
    expect(dailyDay(Date.UTC(2026, 8, 20, 17, 0))).toBe('2026-09-21');
  });

  it('numbers days from the epoch', () => {
    expect(dailyNumber(DAILY_EPOCH)).toBe(1);
    expect(dailyNumber('2026-10-01')).toBe(12);
  });

  it('steps back one day across a month boundary', () => {
    expect(previousDay('2026-10-01')).toBe('2026-09-30');
  });

  it('recognises a well-formed day', () => {
    expect(isDay('2026-09-21')).toBe(true);
    expect(isDay('2026-13-40')).toBe(false);
    expect(isDay(20260921)).toBe(false);
  });
});
