import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  COUNTRY_CODE,
  getRegion,
  isRegion,
  ancestorsOf,
  childrenOf,
  leavesUnder,
  provinceOf,
  provinces,
  regionPath,
  allRegions,
  isUnresolved,
} from '../src/lib/regions.js';

const LEAVES = allRegions().filter((code) => childrenOf(code).length === 0);
const RESOLVED_LEAVES = LEAVES.filter((code) => !isUnresolved(code));

describe('region tree shape', () => {
  it('has exactly one root, and it is the country', () => {
    const roots = allRegions().filter((code) => getRegion(code).parent === null);
    expect(roots).toEqual([COUNTRY_CODE]);
    expect(getRegion(COUNTRY_CODE).level).toBe('country');
  });

  it('every parent reference resolves', () => {
    for (const code of allRegions()) {
      const { parent } = getRegion(code);
      if (parent !== null) expect(isRegion(parent), `${code} -> ${parent}`).toBe(true);
    }
  });

  it('every child reference resolves and points back', () => {
    for (const code of allRegions()) {
      for (const child of childrenOf(code)) {
        expect(isRegion(child), `${code} -> ${child}`).toBe(true);
        expect(getRegion(child).parent).toBe(code);
      }
    }
  });

  it('has no cycles', () => {
    // ancestorsOf would loop forever on a cycle, so walk with a guard instead.
    for (const code of allRegions()) {
      const seen = new Set();
      let current = code;
      while (current) {
        expect(seen.has(current), `cycle through ${current}`).toBe(false);
        seen.add(current);
        current = getRegion(current).parent;
      }
    }
  });

  it('holds one country, five provinces and 61 leaves', () => {
    const byLevel = (level) => allRegions().filter((c) => getRegion(c).level === level);
    expect(byLevel('country')).toHaveLength(1);
    expect(byLevel('province')).toHaveLength(5);
    expect(LEAVES).toHaveLength(61);
  });

  it('gives every province the country as parent', () => {
    for (const code of provinces()) expect(getRegion(code).parent).toBe(COUNTRY_CODE);
  });
});

describe('ancestry', () => {
  it('walks every leaf up to the country in three steps', () => {
    for (const code of LEAVES) {
      const chain = ancestorsOf(code);
      expect(chain, code).toHaveLength(3);
      expect(chain[0]).toBe(code);
      expect(chain[2]).toBe(COUNTRY_CODE);
    }
  });

  it('places Da Lat under Lam Dong and Duc Hoa under Long An', () => {
    // Pre-2025 administrative units throughout: Duc Hoa belongs to Long An, not
    // the Tay Ninh it was merged into in 2025.
    expect(ancestorsOf('DL')).toEqual(['DL', 'LD', COUNTRY_CODE]);
    expect(ancestorsOf('DH')).toEqual(['DH', 'LA', COUNTRY_CODE]);
  });

  it('resolves the province of a node at every level', () => {
    expect(provinceOf('TPHCM-Q7')).toBe('TPHCM');
    expect(provinceOf('TPHCM')).toBe('TPHCM');
    expect(provinceOf(COUNTRY_CODE)).toBeNull();
  });

  it('collects every leaf under a node', () => {
    expect(leavesUnder(COUNTRY_CODE).sort()).toEqual([...LEAVES].sort());
    expect(leavesUnder('LD')).toEqual(['DL']);
    expect(leavesUnder('DL')).toEqual(['DL']);
  });

  it('renders an outermost-first path', () => {
    expect(regionPath('DL')).toEqual(['Vietnam', 'Lam Dong', 'Da Lat']);
  });

  it('rejects an unknown code with the known ones listed', () => {
    expect(() => getRegion('NOPE')).toThrow(/Unknown region: NOPE/);
    expect(isRegion('NOPE')).toBe(false);
  });
});

describe('geography', () => {
  it('gives every resolved node a well-formed bbox', () => {
    for (const code of allRegions()) {
      const region = getRegion(code);
      if (!region.bbox) continue;
      const [minLng, minLat, maxLng, maxLat] = region.bbox;
      expect(maxLng, code).toBeGreaterThan(minLng);
      expect(maxLat, code).toBeGreaterThan(minLat);
    }
  });

  it('keeps every centre inside the box it labels', () => {
    // A centre outside its own bbox opens the map on one place while the
    // panorama comes from another.
    for (const code of allRegions()) {
      const region = getRegion(code);
      if (!region.bbox || !region.center) continue;
      const [minLng, minLat, maxLng, maxLat] = region.bbox;
      const [lat, lng] = region.center;
      expect(lat, `${code} centre latitude`).toBeGreaterThanOrEqual(minLat);
      expect(lat, `${code} centre latitude`).toBeLessThanOrEqual(maxLat);
      expect(lng, `${code} centre longitude`).toBeGreaterThanOrEqual(minLng);
      expect(lng, `${code} centre longitude`).toBeLessThanOrEqual(maxLng);
    }
  });

  it('nests every resolved leaf inside its province', () => {
    for (const code of RESOLVED_LEAVES) {
      const leaf = getRegion(code);
      const province = getRegion(provinceOf(code));
      if (!leaf.bbox || !province.bbox) continue;
      // Simplification moves both outlines by a few metres, so allow a small
      // slack rather than demanding exact containment.
      const slack = 0.01;
      expect(leaf.bbox[0], `${code} west`).toBeGreaterThanOrEqual(province.bbox[0] - slack);
      expect(leaf.bbox[1], `${code} south`).toBeGreaterThanOrEqual(province.bbox[1] - slack);
      expect(leaf.bbox[2], `${code} east`).toBeLessThanOrEqual(province.bbox[2] + slack);
      expect(leaf.bbox[3], `${code} north`).toBeLessThanOrEqual(province.bbox[3] + slack);
    }
  });

  it('keeps the hand-picked centres of the original five entry points', () => {
    // src/lib/game.js explains why these are not polygon centroids: the centre
    // of mass of an irregular outline lands somewhere no one recognises. The
    // build honours a per-node override so a regenerated tree cannot lose them.
    expect(getRegion('HN').center).toEqual([21.0285, 105.8542]);
    expect(getRegion('DN').center).toEqual([16.0544, 108.2022]);
    expect(getRegion('TPHCM').center).toEqual([10.8231, 106.6297]);
    expect(getRegion('DL').center).toEqual([11.9404, 108.4583]);
    expect(getRegion('DH').center).toEqual([10.8888, 106.3825]);
  });
});

describe('coverage', () => {
  it('marks Lam Dong and Long An as partially covered', () => {
    expect(getRegion('LD').partialCoverage).toBeTruthy();
    expect(getRegion('LA').partialCoverage).toBeTruthy();
  });

  it('records an unresolved leaf instead of dropping it', () => {
    // Cu Chi has no boundary relation left in OpenStreetMap, so it cannot be
    // built. It still belongs in the tree: absent coverage is data, not a gap
    // in the model. See the Coverage note in docs/project-overview.md.
    expect(isRegion('TPHCM-CUCHI')).toBe(true);
    expect(getRegion('TPHCM-CUCHI').bbox).toBeUndefined();
    expect(isUnresolved('TPHCM-CUCHI')).toBe(true);
  });

  it('counts unresolved leaves against their province', () => {
    for (const code of provinces()) {
      const unresolved = childrenOf(code).filter(isUnresolved).length;
      expect(getRegion(code).missingParts ?? 0, code).toBe(unresolved);
    }
  });
});

describe('client safety', () => {
  it('never reaches the panorama data', () => {
    // src/lib/regions.js is imported by client components. The panorama
    // indexes are ~25MB of exact answers; a path from one to the other would
    // ship every round's solution to the browser.
    const seen = new Set();
    const walk = (file) => {
      if (seen.has(file) || !existsSync(file)) return;
      seen.add(file);
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/from\s+'(\.[^']+)'/g)) {
        const target = resolve(dirname(file), match[1]);
        expect(target.replace(/\\/g, '/')).not.toContain('data/panos');
        if (target.endsWith('.js')) walk(target);
      }
    };
    walk(resolve('src/lib/regions.js'));
    expect(seen.size).toBeGreaterThan(0);
  });
});

describe('generated barrels', () => {
  // Region codes contain hyphens, which are legal in a filename but not in a
  // bare import identifier or an unquoted object key. A barrel generated
  // without sanitising them is a syntax error that breaks the whole build, so
  // importing them at all is the assertion.

  it('the region tree parses and covers every node', async () => {
    const { REGIONS } = await import('../src/data/regions/index.js');
    expect(Object.keys(REGIONS)).toHaveLength(allRegions().length);
  });

  it('the boundary barrel parses and holds every resolved region', async () => {
    const { REGION_BOUNDARIES } = await import('../src/data/boundaries/index.js');
    const withGeometry = allRegions().filter((code) => getRegion(code).bbox);
    expect(Object.keys(REGION_BOUNDARIES).sort()).toEqual(
      withGeometry.filter((code) => code !== COUNTRY_CODE).sort()
    );
  });
});
