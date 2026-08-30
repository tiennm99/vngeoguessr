import { describe, it, expect } from 'vitest';
import * as turf from '@turf/turf';
import { readFileSync } from 'node:fs';
import { outlineSegments } from '../scripts/lib/assign-districts.mjs';
import {
  getCityIndex,
  getRegionPanos,
  pickRandomPano,
  countPanos,
  indexedCities,
} from '../src/lib/pano-index.js';
import {
  getRegion,
  childrenOf,
  provinceOf,
  coverageOf,
  isPlayable,
  playableRegions,
} from '../src/lib/regions.js';

// Indexes are built per province, so the province list -- not every node in the
// tree -- is what has one. Districts are served by filtering their province.
const CODES = indexedCities();

describe('panorama index', () => {
  it.each(CODES)('%s has an index with panoramas', (code) => {
    expect(countPanos(code)).toBeGreaterThan(0);
  });

  it('rejects an unknown city', () => {
    expect(() => getCityIndex('NOPE')).toThrow(/No panorama index/);
  });

  it.each(CODES)('%s entries are well formed', (code) => {
    const malformed = getCityIndex(code).panos.find(
      (p) =>
        typeof p.id !== 'string' ||
        p.id.length === 0 ||
        !Number.isFinite(p.lat) ||
        !Number.isFinite(p.lng)
    );
    expect(malformed, `${code} has a malformed entry`).toBeUndefined();
  });

  it.each(CODES)('%s ids are unique', (code) => {
    const ids = getCityIndex(code).panos.map((p) => p.id);
    expect(new Set(ids).size, `${code} has duplicate ids`).toBe(ids.length);
  });

  it.each(CODES)('%s panoramas sit inside the city bbox', (code) => {
    // The index is built from tiles covering the bbox, then clipped to the
    // boundary, so anything outside means the clip or the bbox is wrong.
    const [minLng, minLat, maxLng, maxLat] = getRegion(code).bbox;
    const stray = getCityIndex(code).panos.find(
      (p) => p.lat < minLat || p.lat > maxLat || p.lng < minLng || p.lng > maxLng
    );
    expect(stray, `${code} has a panorama outside its bbox`).toBeUndefined();
  });

  it.each(CODES)('%s panoramas sit inside the city boundary', (code) => {
    const boundary = JSON.parse(
      readFileSync(`src/data/boundaries/${code.toLowerCase()}/${code.toLowerCase()}.json`, 'utf8')
    );
    // Sample rather than test every point: booleanPointInPolygon against a
    // detailed outline is slow, and a clipping bug would not hide in a sample.
    const panos = getCityIndex(code).panos;
    const step = Math.max(1, Math.floor(panos.length / 200));
    for (let i = 0; i < panos.length; i += step) {
      const inside = turf.booleanPointInPolygon(
        turf.point([panos[i].lng, panos[i].lat]),
        boundary
      );
      expect(inside, `${code} pano ${panos[i].id} is outside the boundary`).toBe(true);
    }
  });

  it.each(CODES)('%s index bbox agrees with the region tree', (code) => {
    expect(getCityIndex(code).bbox).toEqual(getRegion(code).bbox);
  });
});

describe('pickRandomPano', () => {
  it('returns an entry from the province', () => {
    const chosen = pickRandomPano('LD');
    expect(getCityIndex('LD').panos.some((p) => p.id === chosen.id)).toBe(true);
  });

  it('never returns an excluded id', () => {
    const { panos } = getCityIndex('LD');
    const exclude = new Set(panos.slice(0, panos.length - 1).map((p) => p.id));
    // Only one candidate is left, so the choice is forced and checkable.
    expect(pickRandomPano('LD', exclude).id).toBe(panos[panos.length - 1].id);
  });

  it('throws when everything is excluded', () => {
    const all = new Set(getCityIndex('LD').panos.map((p) => p.id));
    expect(() => pickRandomPano('LD', all)).toThrow(/No panoramas left/);
  });

  it('spreads across the index rather than returning one entry', () => {
    const seen = new Set();
    for (let i = 0; i < 100; i++) seen.add(pickRandomPano('LD').id);
    expect(seen.size).toBeGreaterThan(10);
  });
});

describe('district partition', () => {
  it.each(CODES)('%s accounts for every panorama', (code) => {
    const index = getCityIndex(code);
    const assigned = Object.values(index.districtCounts).reduce((a, b) => a + b, 0);
    expect(assigned + index.unassigned, `${code} counts do not add up`).toBe(
      index.panos.length
    );
  });

  it.each(CODES)('%s leaves nothing unassigned', (code) => {
    // Simplified district outlines do not tile perfectly, so a point can fall
    // in a sliver between two neighbours. It still belongs to one of them, and
    // the build assigns it to the nearest -- leaving it province-only would
    // under-credit that district forever.
    expect(getCityIndex(code).unassigned).toBe(0);
  });

  it.each(CODES)('%s strands few enough points to trust the partition', (code) => {
    // `unassigned` is structurally zero -- the fallback always places a point.
    // `stranded` is the number that carries signal: how many fell outside every
    // district polygon and had to be placed by proximity. It rises when the
    // leaf simplification tolerance opens gaps along shared borders.
    const index = getCityIndex(code);
    const rate = index.stranded / index.panos.length;
    expect(rate, `${code} strands ${(rate * 100).toFixed(2)}%`).toBeLessThan(0.02);
  });

  it.each(CODES)('%s places stranded points within a cell of their district', (code) => {
    // A fallback placement is only defensible if it is close. Ranking by bbox
    // centre once put a point 6km into the wrong district; ranking by the real
    // outline keeps the worst case in the tens of metres.
    expect(getCityIndex(code).worstStrandedKm, code).toBeLessThan(1.1);
  });

  it.each(CODES)('%s district codes are real children of the province', (code) => {
    const expected = childrenOf(code).filter((leaf) => getRegion(leaf).bbox);
    // Copy before sorting. The index object is shared across the whole suite,
    // and every `d` field is an offset into districts[] -- sorting it in place
    // silently repoints every panorama at the wrong district.
    expect([...getCityIndex(code).districts].sort()).toEqual([...expected].sort());
  });

  it.each(CODES)('%s every d index is in range', (code) => {
    const index = getCityIndex(code);
    const bad = index.panos.find(
      (p) => p.d !== undefined && !(p.d >= 0 && p.d < index.districts.length)
    );
    expect(bad, `${code} has an out-of-range district index`).toBeUndefined();
  });

  it('places panoramas inside the district they claim', () => {
    // Sample rather than test all 424,691: point-in-polygon against detailed
    // outlines is slow, and a partition bug would not hide in a sample.
    for (const code of CODES) {
      const index = getCityIndex(code);
      const step = Math.max(1, Math.floor(index.panos.length / 60));
      for (let i = 0; i < index.panos.length; i += step) {
        const pano = index.panos[i];
        if (pano.d === undefined) continue;
        const district = index.districts[pano.d];
        const boundary = JSON.parse(
          readFileSync(
            `src/data/boundaries/${code.toLowerCase()}/${district.toLowerCase()}.json`,
            'utf8'
          )
        );
        const inside = turf.booleanPointInPolygon(
          turf.point([pano.lng, pano.lat]),
          boundary
        );
        // A point placed by the nearest-outline fallback sits just outside its
        // district, in a sliver between simplified neighbours. Measure the real
        // distance to the outline, not to its bbox: for a concave district a
        // bbox admits points kilometres away, which is how a 6km
        // misattribution passed an earlier version of this assertion.
        if (!inside) {
          const km = Math.min(
            ...outlineSegments(boundary).map((line) =>
              turf.pointToLineDistance(turf.point([pano.lng, pano.lat]), line, {
                units: 'kilometers',
              })
            )
          );
          expect(km, `${pano.id} is ${km.toFixed(2)}km outside ${district}`).toBeLessThan(1.1);
        }
      }
    }
  });
});

describe('region-aware selection', () => {
  it('draws from a district and reports that district', () => {
    for (let i = 0; i < 40; i++) {
      expect(pickRandomPano('DL').regionCode).toBe('DL');
    }
  });

  it('draws from a province and reports the district it landed in', () => {
    const province = 'TPHCM';
    for (let i = 0; i < 40; i++) {
      const chosen = pickRandomPano(province);
      expect(provinceOf(chosen.regionCode)).toBe(province);
    }
  });

  it('never reports the country as the resolved region', () => {
    // A VN draw has to resolve to somewhere creditable, or the fan-out has
    // nothing below the country to credit.
    for (let i = 0; i < 60; i++) {
      const chosen = pickRandomPano('VN');
      expect(getRegion(chosen.regionCode).level).not.toBe('country');
    }
  });

  it('spreads a country draw across provinces rather than by panorama count', () => {
    // Ha Noi and Ho Chi Minh hold 97% of the index between them. A
    // panorama-uniform draw would make "anywhere in Vietnam" mean those two.
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(provinceOf(pickRandomPano('VN').regionCode));
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('counts consistently up the tree', () => {
    for (const province of CODES) {
      const leaves = childrenOf(province).filter((leaf) => getRegion(leaf).bbox);
      const sum = leaves.reduce((total, leaf) => total + countPanos(leaf), 0);
      expect(sum, `${province} leaves do not sum to the province`).toBe(countPanos(province));
    }
    expect(countPanos('VN')).toBe(
      CODES.reduce((total, code) => total + countPanos(code), 0)
    );
  });

  it('refuses to materialise the whole country', () => {
    expect(() => getRegionPanos('VN')).toThrow(/does not materialise/);
  });
});

describe('playability', () => {
  it('excludes regions with no coverage', () => {
    // Cu Chi has no boundary left in OSM; Cam Le and Hoa Vang have no Mapillary
    // imagery. All three stay in the tree and out of play.
    for (const code of ['TPHCM-CUCHI', 'DN-CAMLE', 'DN-HOAVANG']) {
      expect(coverageOf(code).panos, code).toBe(0);
      expect(isPlayable(code), code).toBe(false);
    }
  });

  it('requires enough panoramas to survive the retry budget', () => {
    // fetchCityPanorama retries up to 3 times with a different candidate, so a
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

  it('keeps every playable region drawable', () => {
    for (const code of playableRegions()) {
      expect(() => pickRandomPano(code), code).not.toThrow();
    }
  });
});
