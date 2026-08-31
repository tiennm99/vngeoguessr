import { describe, it, expect } from 'vitest';
import {
  SCORE_BANDS,
  bandsForBbox,
  bandsForDiagonal,
  calculateDistance,
  calculateScore,
  formatDistance,
} from '../src/lib/game.js';
import { getRegion } from '../src/lib/regions.js';

describe('calculateScore', () => {
  // The bands are the whole scoring rule, so each boundary is pinned on both
  // sides: an off-by-one here silently rewrites what players are rewarded for.
  it.each([
    [0, 5],
    [50, 5],
    [51, 4],
    [100, 4],
    [101, 3],
    [200, 3],
    [201, 2],
    [500, 2],
    [501, 1],
    [1000, 1],
    [1001, 0],
    [50000, 0],
  ])('scores %dm as %d', (distance, expected) => {
    expect(calculateScore(distance)).toBe(expected);
  });

  it('scores against a supplied ladder', () => {
    const doubled = bandsForDiagonal(20_000);
    expect(calculateScore(150, doubled)).toBe(4);
    expect(calculateScore(150)).toBe(3);
  });
});

describe('bandsForDiagonal', () => {
  it('keeps the base ladder for a district-sized region or smaller', () => {
    expect(bandsForDiagonal(5_000)).toEqual(SCORE_BANDS);
    expect(bandsForDiagonal(10_000)).toEqual(SCORE_BANDS);
  });

  it('stretches thresholds proportionally, preserving points', () => {
    expect(bandsForDiagonal(20_000)).toEqual([
      { maxMeters: 100, points: 5 },
      { maxMeters: 200, points: 4 },
      { maxMeters: 400, points: 3 },
      { maxMeters: 1000, points: 2 },
      { maxMeters: 2000, points: 1 },
    ]);
  });
});

describe('bandsForBbox', () => {
  it('falls back to the base ladder without a bbox', () => {
    expect(bandsForBbox(null)).toBe(SCORE_BANDS);
    expect(bandsForBbox(undefined)).toBe(SCORE_BANDS);
  });

  it('widens the ladder for the whole country', () => {
    // A 1km miss must not be a zero across 331,000 km2 -- that is the whole
    // point of scaling. The exact figure tracks the generated bbox, so pin
    // the property, not the number.
    const bands = bandsForBbox(getRegion('VN').bbox);
    expect(bands[0].maxMeters).toBeGreaterThan(SCORE_BANDS[0].maxMeters * 50);
    expect(bands.map((band) => band.points)).toEqual([5, 4, 3, 2, 1]);
    // Still an ordered ladder.
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i].maxMeters).toBeGreaterThan(bands[i - 1].maxMeters);
    }
  });
});

describe('calculateDistance', () => {
  it('returns zero for identical coordinates', () => {
    expect(calculateDistance(10.8231, 106.6297, 10.8231, 106.6297)).toBe(0);
  });

  it('measures one degree of latitude as roughly 111km', () => {
    const metres = calculateDistance(10, 106, 11, 106);
    // Turf uses a spherical earth, so the exact figure depends on its radius
    // constant. Assert the magnitude, not the constant.
    expect(metres).toBeGreaterThan(110_000);
    expect(metres).toBeLessThan(112_000);
  });

  it('is symmetric', () => {
    const there = calculateDistance(10.8231, 106.6297, 21.0285, 105.8542);
    const back = calculateDistance(21.0285, 105.8542, 10.8231, 106.6297);
    expect(there).toBe(back);
  });

  it('returns whole metres', () => {
    const metres = calculateDistance(10.8231, 106.6297, 10.8241, 106.6307);
    expect(Number.isInteger(metres)).toBe(true);
  });

  it('grows with separation', () => {
    const near = calculateDistance(10.82, 106.62, 10.83, 106.62);
    const far = calculateDistance(10.82, 106.62, 10.9, 106.62);
    expect(far).toBeGreaterThan(near);
  });
});

describe('formatDistance', () => {
  it.each([
    [0, '0m'],
    [999, '999m'],
    [1000, '1.00km'],
    [1500, '1.50km'],
    [12300, '12.30km'],
  ])('formats %dm as %s', (distance, expected) => {
    expect(formatDistance(distance)).toBe(expected);
  });
});
