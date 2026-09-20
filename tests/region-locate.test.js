import { describe, it, expect } from 'vitest';
import { locateRegion, regionHit } from '../src/lib/region-locate.js';

// Points are checked against the generated boundaries, so these coordinates
// are well inside their districts rather than near an edge.
describe('locateRegion', () => {
  it('finds the district a point is in', () => {
    expect(locateRegion(10.734, 106.722)).toBe('TPHCM-Q7');
    expect(locateRegion(21.0285, 105.8542)).toBe('HN-HOANKIEM');
  });

  it('returns null outside every covered area, and for bad input', () => {
    // The sea east of Da Nang.
    expect(locateRegion(16.05, 109.5)).toBeNull();
    expect(locateRegion(NaN, 106)).toBeNull();
  });
});

describe('regionHit', () => {
  it('grades district, province and nothing shared', () => {
    expect(regionHit('TPHCM-Q7', 'TPHCM-Q7')).toBe('district');
    expect(regionHit('TPHCM-Q1', 'TPHCM-Q7')).toBe('province');
    expect(regionHit('HN-HOANKIEM', 'TPHCM-Q7')).toBe('none');
    expect(regionHit(null, 'TPHCM-Q7')).toBe('none');
  });

  it('treats a province-level answer as a province hit at best', () => {
    // A panorama that fell outside every district outline resolves to its
    // province; landing anywhere in that province is the most a guess can do.
    expect(regionHit('TPHCM-Q7', 'TPHCM')).toBe('province');
    expect(regionHit('TPHCM', 'TPHCM')).toBe('province');
  });
});
