import { describe, it, expect } from 'vitest';
import {
  cities,
  cityNames,
  cityCenters,
  cityBboxes,
  calculateDistance,
  calculateScore,
  formatDistance,
} from '../src/lib/game.js';
import { allRegions, getRegion, provinces } from '../src/lib/regions.js';

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

describe('region lookups', () => {
  // Shape and geography of the tree itself are covered by regions.test.js.
  // These assert only that game.js's derived lookups stay faithful to it.

  it('offers the provinces, and only the provinces, as entry points', () => {
    expect(cities.map((city) => city.code)).toEqual(provinces());
  });

  it('uppercases entry-point names for the UI', () => {
    for (const city of cities) {
      expect(city.name).toBe(city.name.toUpperCase());
    }
  });

  it('names every node, not just the entry points', () => {
    // A bookmarked /game?location=DL has to keep resolving now that Da Lat is a
    // district of Lam Dong rather than a top-level city.
    for (const code of allRegions()) {
      expect(cityNames[code], code).toBe(getRegion(code).name);
    }
    expect(cityNames.DL).toBe('Da Lat');
  });

  it('mirrors the tree for centres and boxes it has', () => {
    for (const code of allRegions()) {
      const region = getRegion(code);
      if (region.center) expect(cityCenters[code], code).toEqual(region.center);
      if (region.bbox) expect(cityBboxes[code], code).toEqual(region.bbox);
    }
  });

  it('omits nodes with no boundary rather than inventing one', () => {
    // Cu Chi has no OSM relation left, so it has no extent to look up.
    expect(cityBboxes['TPHCM-CUCHI']).toBeUndefined();
    expect(cityNames['TPHCM-CUCHI']).toBe('Cu Chi');
  });
});
