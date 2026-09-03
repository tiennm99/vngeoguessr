import { describe, it, expect } from 'vitest';
import {
  SCORE_BANDS,
  calculateDistance,
  calculateScore,
  formatDistance,
} from '../src/lib/game.js';

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

  it('is the same ladder for every region', () => {
    expect(SCORE_BANDS.map((band) => band.maxMeters)).toEqual([50, 100, 200, 500, 1000]);
    expect(SCORE_BANDS.map((band) => band.points)).toEqual([5, 4, 3, 2, 1]);
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
