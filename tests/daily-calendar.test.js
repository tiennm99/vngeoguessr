import { describe, it, expect } from 'vitest';
import { dailyDay, previousDay, dailyNumber, DAILY_EPOCH } from '../src/lib/daily-calendar.js';

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

  it('steps back one day across month and year boundaries', () => {
    expect(previousDay('2026-10-01')).toBe('2026-09-30');
    expect(previousDay('2027-01-01')).toBe('2026-12-31');
    expect(previousDay('2028-03-01')).toBe('2028-02-29');
  });
});
