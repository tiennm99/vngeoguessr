import { describe, it, expect, beforeAll, vi } from 'vitest';
vi.mock('@neondatabase/serverless', async () => {
  const { neonModule } = await import('./mock-neon.js');
  return neonModule();
});

import {
  pickRandomPano,
  countPanos,
  indexedProvinces,
  getRegionPanoSample,
  getProvinceMeta,
} from '../src/lib/pano-index.js';
import { getRegion, childrenOf, provinceOf, coverageOf, isPlayable, playableRegions } from '../src/lib/regions.js';
import { seedPanoFixtures, FIXTURE_PANOS, UNASSIGNED_PANO, fixtureIds, GENERATED_AT } from './pano-fixtures.js';

// These tests pin the query behavior of pano-index.js against the PGlite fake.
// The data-quality invariants that used to run here against the real JSON
// index (bbox containment, district partition, stranded distances) moved to
// scripts/seed-pano-db.mjs, which refuses to seed artifacts that violate them.
//
// Seeded once, before anything reads: countPanos caches for the process
// lifetime, so rows must all exist before the first query. The unassigned
// (district NULL) panorama is included here on purpose -- province-level
// crediting is under test.

beforeAll(async () => {
  await seedPanoFixtures(true);
});

describe('countPanos', () => {
  it('counts a province', async () => {
    expect(await countPanos('LD')).toBe(fixtureIds('LD').length);
  });

  it('counts a district', async () => {
    expect(await countPanos('DN-HAICHAU')).toBe(fixtureIds('DN-HAICHAU').length);
  });

  it('excludes the unassigned panorama from every district but not the province', async () => {
    const leaves = childrenOf('DN').filter((leaf) => getRegion(leaf).bbox);
    let sum = 0;
    for (const leaf of leaves) sum += await countPanos(leaf);
    // The district-NULL row is province-only, so the leaves sum one short.
    expect(await countPanos('DN')).toBe(sum + 1);
  });

  it('counts the country as the sum of provinces', async () => {
    let sum = 0;
    for (const code of ['HN', 'TPHCM', 'DN', 'LD', 'LA']) sum += await countPanos(code);
    expect(await countPanos('VN')).toBe(sum);
    expect(await countPanos('VN')).toBe(FIXTURE_PANOS.length + 1);
  });
});

describe('pickRandomPano', () => {
  it('returns an entry from the province', async () => {
    const chosen = await pickRandomPano('LD');
    expect(fixtureIds('LD')).toContain(chosen.id);
    expect(Number.isFinite(chosen.lat)).toBe(true);
    expect(Number.isFinite(chosen.lng)).toBe(true);
  });

  it('never returns an excluded id', async () => {
    const ids = fixtureIds('LD');
    const exclude = new Set(ids.slice(0, ids.length - 1));
    // Only one candidate is left, so the choice is forced and checkable.
    for (let i = 0; i < 10; i++) {
      expect((await pickRandomPano('LD', exclude)).id).toBe(ids[ids.length - 1]);
    }
  });

  it('throws when everything is excluded', async () => {
    const all = new Set(fixtureIds('LD'));
    await expect(pickRandomPano('LD', all)).rejects.toThrow(/No panoramas left/);
  });

  it('spreads across the pool rather than returning one entry', async () => {
    const seen = new Set();
    for (let i = 0; i < 60; i++) seen.add((await pickRandomPano('LD')).id);
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe('region-aware selection', () => {
  it('draws from a district and reports that district', async () => {
    for (let i = 0; i < 20; i++) {
      expect((await pickRandomPano('DL')).regionCode).toBe('DL');
    }
  });

  it('draws from a province and reports the district it landed in', async () => {
    for (let i = 0; i < 20; i++) {
      const chosen = await pickRandomPano('TPHCM');
      expect(provinceOf(chosen.regionCode)).toBe('TPHCM');
      expect(getRegion(chosen.regionCode).level).toBe('district');
    }
  });

  it('credits a panorama outside every district to the province', async () => {
    // Force the draw onto the one district-NULL row by excluding the rest.
    const exclude = new Set(fixtureIds('DN'));
    const chosen = await pickRandomPano('DN', exclude);
    expect(chosen.id).toBe(UNASSIGNED_PANO[0]);
    expect(chosen.regionCode).toBe('DN');
  });

  it('never reports the country as the resolved region', async () => {
    // A VN draw has to resolve to somewhere creditable, or the fan-out has
    // nothing below the country to credit.
    for (let i = 0; i < 30; i++) {
      const chosen = await pickRandomPano('VN');
      expect(getRegion(chosen.regionCode).level).not.toBe('country');
    }
  });

  it('spreads a country draw across provinces rather than by panorama count', async () => {
    const seen = new Set();
    for (let i = 0; i < 120; i++) {
      seen.add(provinceOf((await pickRandomPano('VN')).regionCode));
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('skips a province whose pool is fully excluded and still resolves', async () => {
    // Exclude everything outside Lam Dong: every VN draw must land there.
    const exclude = new Set(
      [...FIXTURE_PANOS, UNASSIGNED_PANO].filter(([, p]) => p !== 'LD').map(([id]) => id)
    );
    for (let i = 0; i < 10; i++) {
      expect(provinceOf((await pickRandomPano('VN', exclude)).regionCode)).toBe('LD');
    }
  });

  it('throws when the whole country is excluded', async () => {
    const all = new Set([...FIXTURE_PANOS, UNASSIGNED_PANO].map(([id]) => id));
    await expect(pickRandomPano('VN', all)).rejects.toThrow(/No panoramas left/);
  });
});

describe('getRegionPanoSample', () => {
  it('returns everything when the pool fits the limit', async () => {
    const sample = await getRegionPanoSample('LD', null, null, null, null, 100);
    expect(sample.total).toBe(fixtureIds('LD').length);
    expect(sample.inView).toBe(sample.total);
    expect(sample.panos.map((p) => p.id).sort()).toEqual(fixtureIds('LD').sort());
  });

  it('samples evenly when the pool exceeds the limit', async () => {
    const sample = await getRegionPanoSample('LD', null, null, null, null, 2);
    expect(sample.inView).toBe(5);
    // Floored stride 2 over rows ordered by latitude, capped by the limit:
    // the first and third rows. Never fewer than the limit while rows remain.
    expect(sample.panos.map((p) => p.id)).toEqual(['ld-1', 'ld-3']);
  });

  it('filters by viewport bbox', async () => {
    // Only ld-1 and ld-2 sit below latitude 11.915.
    const sample = await getRegionPanoSample('LD', 108.0, 11.8, 109.0, 11.915, 100);
    expect(sample.inView).toBe(2);
    expect(sample.total).toBe(5);
    expect(sample.panos.map((p) => p.id).sort()).toEqual(['ld-1', 'ld-2']);
  });

  it('works at district level', async () => {
    const sample = await getRegionPanoSample('DN-SONTRA', null, null, null, null, 100);
    expect(sample.panos.map((p) => p.id).sort()).toEqual(fixtureIds('DN-SONTRA').sort());
  });
});

describe('province metadata', () => {
  it('lists seeded provinces', async () => {
    expect(await indexedProvinces()).toEqual(['DN', 'HN', 'LA', 'LD', 'TPHCM']);
  });

  it('reports seed-time metadata', async () => {
    const meta = await getProvinceMeta('LD');
    expect(meta.count).toBe(fixtureIds('LD').length);
    expect(meta.generatedAt).toBe(GENERATED_AT);
  });

  it('returns null for a province never seeded', async () => {
    expect(await getProvinceMeta('NOPE')).toBeNull();
  });
});

describe('playability', () => {
  // These read the committed counts.js, not the database: playability is a
  // client-side property and must not require a DB round trip.
  it('excludes regions with no coverage', () => {
    // Cu Chi has no boundary left in OSM; Cam Le and Hoa Vang have no Mapillary
    // imagery. All three stay in the tree and out of play.
    for (const code of ['TPHCM-CUCHI', 'DN-CAMLE', 'DN-HOAVANG']) {
      expect(coverageOf(code).panos, code).toBe(0);
      expect(isPlayable(code), code).toBe(false);
    }
  });

  it('requires enough panoramas to survive the retry budget', () => {
    // fetchRegionPanorama retries up to 3 times with a different candidate, so a
    // region with fewer than that throws instead of degrading.
    for (const code of playableRegions()) {
      expect(coverageOf(code).panos, code).toBeGreaterThanOrEqual(3);
    }
  });

  it('judges coverage by distinct places, not raw count', () => {
    for (const code of playableRegions()) {
      expect(coverageOf(code).cells, code).toBeGreaterThanOrEqual(3);
    }
  });
});
